"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCsv = toCsv;
/** Minimal CSV serializer — quotes any field containing a comma, quote, or newline. */
function toCsv(rows) {
    if (rows.length === 0)
        return "";
    const headers = Object.keys(rows[0]);
    const escape = (value) => {
        const str = value == null ? "" : String(value);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))];
    return lines.join("\n");
}
