//! Trusted GitHub Releases updater for the Windows per-user installer.
//! Checks and downloads in the background; installation always requires a click.
//! Never downloads from arbitrary URLs or runs a file that fails SHA-256.
use reqwest::{blocking::Client, Url};
use semver::Version;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

const RELEASES_API: &str = "https://api.github.com/repos/crenem/SOAR-Desk/releases?per_page=30";
const INSTALLER_NAME: &str = "SOAR-Desk-Setup.exe";
const MAX_INSTALLER_BYTES: u64 = 1_073_741_824;
const CHANNEL: &str = match option_env!("SOAR_UPDATE_CHANNEL") {
    Some(value) => value,
    None => "preview",
};

#[derive(Clone, Debug)]
pub struct AvailableUpdate {
    pub version: Version,
    pub tag: String,
    url: Url,
    sha256: String,
    size: u64,
}

pub enum Lookup {
    NoPublished,
    UpToDate,
    Available(AvailableUpdate),
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent(concat!("SOAR-Desk/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("HTTP client: {e}"))
}

fn digest_hex(text: &str) -> Option<String> {
    let hex = text.strip_prefix("sha256:")?;
    if hex.len() != 64 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(hex.to_ascii_lowercase())
}

fn trusted_asset_url(text: &str, tag: &str) -> Option<Url> {
    let parsed = Url::parse(text).ok()?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || parsed.port().is_some()
        || parsed.username() != ""
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != format!("/crenem/SOAR-Desk/releases/download/{tag}/{INSTALLER_NAME}")
    {
        return None;
    }
    Some(parsed)
}

fn choose_release(data: &Value, installed: &Version, allow_preview: bool) -> Result<Lookup, String> {
    let releases = data.as_array().ok_or("Invalid GitHub Releases response")?;
    if releases.is_empty() {
        return Ok(Lookup::NoPublished);
    }
    let mut newest: Option<AvailableUpdate> = None;
    for release in releases {
        if release["draft"].as_bool() != Some(false) {
            continue;
        }
        let is_preview = release["prerelease"].as_bool().unwrap_or(false);
        if is_preview && !allow_preview {
            continue;
        }
        let Some(tag) = release["tag_name"].as_str() else {
            continue;
        };
        let Some(without_v) = tag.strip_prefix('v') else {
            continue;
        };
        let Ok(version) = Version::parse(without_v) else {
            continue;
        };
        // A preview build may take either a newer preview or a stable release.
        // Do not offer older, equal, or differently ordered versions.
        if version <= *installed
            || (is_preview != !version.pre.is_empty())
            || newest.as_ref().is_some_and(|found| found.version >= version)
        {
            continue;
        }
        let Some(assets) = release["assets"].as_array() else {
            continue;
        };
        for asset in assets {
            if asset["name"].as_str() != Some(INSTALLER_NAME)
                || asset["state"].as_str() != Some("uploaded")
            {
                continue;
            }
            let Some(digest) = asset["digest"].as_str().and_then(digest_hex) else {
                continue;
            };
            let Some(size) = asset["size"].as_u64() else {
                continue;
            };
            if !(1_000_000..=MAX_INSTALLER_BYTES).contains(&size) {
                continue;
            }
            let Some(url) = asset["browser_download_url"]
                .as_str()
                .and_then(|u| trusted_asset_url(u, tag))
            else {
                continue;
            };
            newest = Some(AvailableUpdate {
                version: version.clone(),
                tag: tag.to_owned(),
                url,
                sha256: digest,
                size,
            });
            break;
        }
    }
    Ok(match newest {
        Some(update) => Lookup::Available(update),
        None => Lookup::UpToDate,
    })
}

pub fn check() -> Result<Lookup, String> {
    let current = Version::parse(env!("CARGO_PKG_VERSION"))
        .map_err(|e| format!("Invalid installed version: {e}"))?;
    let http = client()?;
    let response = http
        .get(RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("Could not connect to GitHub Releases: {e}"))?
        .error_for_status()
        .map_err(|e| format!("GitHub update check: {e}"))?;
    let payload: Value = response.json().map_err(|e| format!("Release data: {e}"))?;
    choose_release(&payload, &current, CHANNEL != "stable")
}

/// Verifies both the file length and the SHA-256 supplied by GitHub's release
/// asset metadata. No installer can be launched from an unverified cache entry.
pub fn verify_file(update: &AvailableUpdate, path: &Path) -> Result<bool, String> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(format!("Cannot read downloaded installer: {error}")),
    };
    if file.metadata().map_err(|e| e.to_string())?.len() != update.size {
        return Ok(false);
    }
    let mut sha = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let len = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if len == 0 {
            break;
        }
        sha.update(&buffer[..len]);
    }
    Ok(format!("{:x}", sha.finalize()) == update.sha256)
}

pub fn stage(
    update: &AvailableUpdate,
    mut progress: impl FnMut(u8),
) -> Result<PathBuf, String> {
    let root = dirs::cache_dir()
        .unwrap_or(std::env::temp_dir())
        .join("SOAR Desk")
        .join("updates")
        .join(update.version.to_string());
    fs::create_dir_all(&root).map_err(|e| format!("Update cache: {e}"))?;
    let destination = root.join(INSTALLER_NAME);
    if verify_file(update, &destination)? {
        progress(100);
        return Ok(destination);
    }
    // A partial download is never considered installable.
    let tmp = root.join("SOAR-Desk-Setup.download");
    if destination.exists() {
        fs::remove_file(&destination).map_err(|e| format!("Old cached installer: {e}"))?;
    }
    if tmp.exists() {
        fs::remove_file(&tmp).map_err(|e| format!("Previous partial download: {e}"))?;
    }
    let http = Client::builder()
        .user_agent(concat!("SOAR-Desk/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(1200))
        .build()
        .map_err(|e| format!("Downloader: {e}"))?;
    let result = (|| -> Result<(), String> {
        let mut response = http
            .get(update.url.clone())
            .send()
            .map_err(|e| format!("Installer download: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Installer download rejected: {e}"))?;
        let mut file = File::create(&tmp).map_err(|e| format!("Update cache: {e}"))?;
        let mut sha = Sha256::new();
        let mut bytes = 0u64;
        let mut previous_pct = 0;
        let mut buffer = [0u8; 65536];
        while let Some(remaining) = update.size.checked_sub(bytes) {
            if remaining == 0 {
                break;
            }
            let count = response.read(&mut buffer).map_err(|e| format!("Download interrupted: {e}"))?;
            if count == 0 {
                break;
            }
            bytes = bytes.saturating_add(count as u64);
            if bytes > update.size || bytes > MAX_INSTALLER_BYTES {
                return Err("Downloaded installer exceeds expected size".into());
            }
            file.write_all(&buffer[..count]).map_err(|e| format!("Disk full: {e}"))?;
            sha.update(&buffer[..count]);
            let pct = ((bytes.saturating_mul(100)) / update.size) as u8;
            if pct > previous_pct {
                progress(pct);
                previous_pct = pct;
            }
        }
        if bytes != update.size {
            return Err(format!("Incomplete installer: {bytes} of {} bytes", update.size));
        }
        if format!("{:x}", sha.finalize()) != update.sha256 {
            return Err("Installer checksum does not match GitHub release metadata".into());
        }
        file.sync_all().map_err(|e| format!("Cannot finish download: {e}"))?;
        drop(file);
        fs::rename(&tmp, &destination).map_err(|e| format!("Cannot stage installer: {e}"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result?;
    if !verify_file(update, &destination)? {
        let _ = fs::remove_file(&destination);
        return Err("Staged installer verification failed".into());
    }
    progress(100);
    Ok(destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item(tag: &str, preview: bool, digest: &str, url: &str) -> Value {
        let trusted = format!("https://github.com/crenem/SOAR-Desk/releases/download/{tag}/SOAR-Desk-Setup.exe");
        let asset_url = if url == "TRUSTED" { trusted.as_str() } else { url };
        serde_json::json!({
            "draft": false, "prerelease": preview, "tag_name": tag,
            "assets": [{"name": "SOAR-Desk-Setup.exe", "state": "uploaded",
                "size": 20000000, "digest": digest,
                "browser_download_url": asset_url }]
        })
    }
    const URL: &str = "TRUSTED";
    const SHA: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    #[test]
    fn selects_newer_preview_with_valid_hash_only() {
        let payload = serde_json::json!([
            item("v0.1.1-preview.1", true, SHA, URL),
            item("v0.1.2-preview.1", true, SHA, URL)
        ]);
        let old = Version::parse("0.1.0").unwrap();
        match choose_release(&payload, &old, true).unwrap() {
            Lookup::Available(update) => assert_eq!(update.version.to_string(), "0.1.2-preview.1"),
            _ => panic!("Expected a preview update"),
        }
        assert!(matches!(choose_release(&payload, &old, false).unwrap(), Lookup::UpToDate));
    }
    #[test]
    fn rejects_untrusted_hosts_and_missing_checksums() {
        let old = Version::new(0, 1, 0);
        for (digest, url) in [(SHA, "https://example.com/evil.exe"), ("", URL), ("sha256:xyz", URL)] {
            assert!(matches!(
                choose_release(&serde_json::json!([item("v1.0.0", false, digest, url)]), &old, true).unwrap(),
                Lookup::UpToDate
            ));
        }
    }
    #[test]
    fn ignores_downgrades_and_drafts() {
        let old = Version::parse("0.1.2").unwrap();
        let mut draft = item("v1.0.0", false, SHA, URL);
        draft["draft"] = serde_json::json!(true);
        let payload = serde_json::json!([item("v0.1.1", false, SHA, URL), draft]);
        assert!(matches!(choose_release(&payload, &old, true).unwrap(), Lookup::UpToDate));
    }
    #[test]
    fn empty_release_list_is_not_an_error() {
        assert!(matches!(choose_release(&serde_json::json!([]), &Version::new(0, 1, 0), true).unwrap(), Lookup::NoPublished));
    }
}
