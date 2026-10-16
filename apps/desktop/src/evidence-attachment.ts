/** Metadata returned by the native, authenticated encrypted-blob writer.
 * The original document bytes never transit through the React case state. */
export type AttachedSource={
 blob_id:string;
 original_name:string;
 bytes:number;
 sha256:string;
 encrypted_path:string;
};
