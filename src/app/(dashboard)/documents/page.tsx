import { UploadDropzone } from "@/components/documents/upload-dropzone";
import { DocumentsTable } from "@/components/documents/documents-table";

export const metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Upload financial documents — they&apos;ll be read, classified, and prepared for review automatically.
        </p>
      </div>
      <UploadDropzone />
      <DocumentsTable />
    </div>
  );
}
