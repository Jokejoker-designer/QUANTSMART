import { useEffect, type ReactNode } from "react";
import { initializeWorkspace, installWorkspaceSync, useWorkspaceStatus, flushWorkspace } from "../lib/workspaceClient.ts";
export function WorkspaceGate({children}:{children:ReactNode}) {
  const status=useWorkspaceStatus();
  useEffect(()=>{void initializeWorkspace().catch(()=>{});return installWorkspaceSync();},[]);
  if(status.phase==="loading")return <div className="workspace-service-message" role="status">Opening your workspace…</div>;
  if(status.phase==="error"&&!status.savedAt)return <div className="workspace-service-message" role="alert"><h1>Workspace service unavailable</h1><p>Your saved research is not being replaced with demo data. Start the local application service and retry.</p><code>{status.error}</code><p><button onClick={()=>{void initializeWorkspace().catch(()=>{});}}>Retry connection</button></p></div>;
  return <>{children}</>;
}
export function WorkspaceSaveStatus(){const status=useWorkspaceStatus();return <span className={`workspace-save-state ${status.phase}`} role="status">{status.phase==="saving"?"Saving…":status.phase==="error"?<button onClick={()=>void flushWorkspace().catch(()=>{})} title={status.error||""}>Save failed · retry</button>:"Saved to workspace"}</span>;}
