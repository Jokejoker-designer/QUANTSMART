import { Component, type ReactNode } from "react";
export class WorkspaceErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed)return <section className="workspace-service-message" role="alert"><h1>This workspace could not be opened</h1><p>Your saved research has not been replaced. Reload to reconnect to the local service and restore persisted data.</p><button onClick={()=>window.location.reload()}>Reload workspace</button></section>;
    return this.props.children;
  }
}
