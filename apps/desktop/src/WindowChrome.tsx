import {useEffect,useState} from "react";
import {getCurrentWindow} from "@tauri-apps/api/window";

/** Accessible window controls backed by actual Tauri window commands. */
export default function WindowChrome(){
 const [maximized,setMaximized]=useState(false);
 const [problem,setProblem]=useState("");
 useEffect(()=>{
   const win=getCurrentWindow();
   let live=true;
   const refresh=()=>{void win.isMaximized().then(v=>{if(live)setMaximized(v)}).catch(()=>{});};
   refresh();
   const unlisten=win.onResized(refresh).catch(()=>undefined);
   return ()=>{live=false;void unlisten.then(fn=>fn?.());};
 },[]);
 async function action(type:"minimize"|"maximize"|"close"){
  const win=getCurrentWindow();
  try{
   if(type==="minimize") await win.minimize();
   if(type==="maximize") {await win.toggleMaximize();setMaximized(await win.isMaximized());}
   if(type==="close") await win.close();
   setProblem("");
  }catch(error){setProblem("Window control failed: "+String(error));}
 }
 return <div className="window-chrome">
  <div className="window-drag" data-tauri-drag-region onDoubleClick={()=>void action("maximize")} title="Drag to move, double-click to maximize or restore">
   <span data-tauri-drag-region className="window-appname">SOAR Desk</span>
   <span data-tauri-drag-region className="window-separator">—</span>
   <span data-tauri-drag-region className="window-mode">Community edition</span>
  </div>
  {problem&&<span role="alert" className="window-error">{problem}</span>}
  <div className="window-controls" aria-label="Window controls">
   <button type="button" title="Minimize" aria-label="Minimize window" onClick={()=>void action("minimize")}>─</button>
   <button type="button" title={maximized?"Restore":"Maximize"} aria-label={maximized?"Restore window":"Maximize window"} onClick={()=>void action("maximize")}>{maximized?"❐":"□"}</button>
   <button type="button" className="window-close" title="Close" aria-label="Close window" onClick={()=>void action("close")}>×</button>
  </div>
 </div>;
}
