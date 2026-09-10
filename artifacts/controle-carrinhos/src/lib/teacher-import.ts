import * as XLSX from "xlsx";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const uniqueEmails = (value: string) => [
  ...new Set(
    value
      .match(emailPattern)
      ?.map((email) => email.toLowerCase())
      .filter(Boolean) ?? [],
  ),
];

const readTextFile = async (file: File) => file.text();

const readSpreadsheetFile = async (file: File) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return workbook.SheetNames
    .map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_csv(sheet);
    })
    .join("\n");
};

const readPdfFile = async (file: File) => {
  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = workerUrl;
  const document = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }

  return pages.join("\n");
};

export async function parseTeacherEmailsFile(file: File): Promise<string[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  let content: string;

  if (extension === "pdf" || file.type === "application/pdf") {
    content = await readPdfFile(file);
  } else if (extension === "xlsx" || extension === "xls") {
    content = await readSpreadsheetFile(file);
  } else if (extension === "csv" || extension === "tsv" || extension === "txt") {
    content = await readTextFile(file);
  } else {
    throw new Error("Formato não suportado. Escolha uma planilha CSV/XLS/XLSX ou um PDF.");
  }

  const emails = uniqueEmails(content);
  if (emails.length === 0) {
    throw new Error("Nenhum e-mail válido foi encontrado no arquivo.");
  }

  return emails;
}
