export function ResearchJobStatus({ pending, error }: { pending: boolean; error: string | null }) {
  if (!pending && !error) return null;
  return <div className="research-job-status" role={error ? "alert" : "status"} style={{ padding: "10px 12px", marginBottom: 12, fontSize: 12, color: error ? "#e7aaa0" : "#afc4d9", border: "1px solid var(--mfe-border)", borderRadius: 4 }}>
    {error ? `Research job failed: ${error}. Check the dataset and service, then retry the run.` : "Processing on the research service. The interface remains available; a previous result will not be assigned to new inputs."}
  </div>;
}
