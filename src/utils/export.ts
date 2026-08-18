import * as XLSX from "xlsx";
import { Response } from "express";

export interface ExportOptions {
  filename: string;
  format: "csv" | "excel";
}

/**
 * Convert data array to CSV string
 */
export function convertToCSV(data: any[], headers: string[]): string {
  // Create CSV header row
  const csvRows = [headers.join(",")];

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      // Handle null/undefined
      if (value === null || value === undefined) return "";
      // Handle arrays/objects - convert to string
      if (typeof value === "object") {
        return JSON.stringify(value).replace(/"/g, '""');
      }
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      const stringValue = String(value);
      if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

/**
 * Convert data array to Excel buffer
 */
export function convertToExcel(data: any[], headers: string[]): Buffer {
  // Create worksheet data
  const worksheetData = [headers];

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      // Handle null/undefined
      if (value === null || value === undefined) return "";
      // Handle arrays/objects - convert to readable string
      if (Array.isArray(value)) {
        return value.join(", ");
      }
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
      return value;
    });
    worksheetData.push(values);
  }

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths (auto-width)
  const colWidths = headers.map((_, index) => {
    const maxLength = Math.max(
      headers[index].length,
      ...data.map((row) => {
        const value = row[headers[index]];
        if (value === null || value === undefined) return 0;
        if (typeof value === "object") return JSON.stringify(value).length;
        return String(value).length;
      })
    );
    return { wch: Math.min(Math.max(maxLength, 10), 50) };
  });
  worksheet["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  // Convert to buffer
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

/**
 * Send export file as response
 */
export function sendExport(
  res: Response,
  data: any[],
  headers: string[],
  options: ExportOptions
): void {
  if (options.format === "csv") {
    const csv = convertToCSV(data, headers);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${options.filename}.csv"`);
    res.send(csv);
  } else {
    const excelBuffer = convertToExcel(data, headers);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${options.filename}.xlsx"`);
    res.send(excelBuffer);
  }
}


