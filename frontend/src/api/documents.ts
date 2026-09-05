import { apiClient } from "./client";
import type { DocumentRead } from "./types";

export async function uploadDocument(file: File): Promise<DocumentRead> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<DocumentRead>("/documents", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listDocuments(): Promise<DocumentRead[]> {
  const { data } = await apiClient.get<DocumentRead[]>("/documents");
  return data;
}

export async function getDocument(documentId: string): Promise<DocumentRead> {
  const { data } = await apiClient.get<DocumentRead>(`/documents/${documentId}`);
  return data;
}
