// Clipboard success is reported only after the browser confirms the write.
export async function writePromptText(text:string, writer?: (text:string)=>Promise<void>):Promise<void> {
 const write=writer ?? (typeof navigator!=="undefined"&&navigator.clipboard?.writeText?navigator.clipboard.writeText.bind(navigator.clipboard):undefined);
 if(!write)throw new Error("Clipboard is unavailable. Use a supported localhost browser and allow clipboard access.");
 await write(text);
}
