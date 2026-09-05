import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listDocuments, uploadDocument } from "../api/documents";
import { StatusBadge } from "../components/documents/StatusBadge";
import { UploadButton } from "../components/documents/UploadButton";

const ACTIVE_STATUSES = new Set(["pending", "processing"]);

export function DocumentsPage() {
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
    refetchInterval: (query) => {
      const documents = query.state.data ?? [];
      return documents.some((doc) => ACTIVE_STATUSES.has(doc.status)) ? 2000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const documents = documentsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Documents</h1>
        <UploadButton
          uploading={uploadMutation.isPending}
          onSelect={(file) => uploadMutation.mutate(file)}
        />
      </div>

      {uploadMutation.isError && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Upload failed: {(uploadMutation.error as Error).message}
        </p>
      )}

      {documents.length === 0 ? (
        <p className="text-slate-400">
          No documents yet. Upload one so the chatbot can answer questions about it.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{doc.filename}</p>
                <p className="text-xs text-slate-400">
                  {new Date(doc.created_at).toLocaleString()}
                  {doc.status === "failed" && doc.error_message ? ` — ${doc.error_message}` : ""}
                </p>
              </div>
              <StatusBadge status={doc.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
