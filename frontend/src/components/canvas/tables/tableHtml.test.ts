import { beforeAll, describe, expect, it } from "vitest";
import {
  cssColorToHex,
  setCustomTextMetricsProvider,
  fillCellsFromPaste,
  newTableElement,
  parseHTMLTable,
  pastedCellCount,
  rangeToHTML,
  tableLayoutFromPaste,
} from "@excalidraw/element";

// jsdom has no canvas to measure text with
beforeAll(() => {
  setCustomTextMetricsProvider({
    getLineWidth: (text, font) => text.length * parseFloat(font) * 0.5,
  });
});

// Trimmed-down versions of what each application puts on the clipboard.

const EXCEL = `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><style><!--
td {padding-top:1px; color:windowtext; font-size:11.0pt; font-weight:400; font-style:normal; vertical-align:bottom;}
.xl65 {color:white; font-size:14.0pt; font-weight:700; text-align:center; background:#C00000; mso-pattern:black none;}
.xl66 {font-style:italic; text-align:right;}
--></style></head>
<body><!--StartFragment-->
<table border=0 cellpadding=0 cellspacing=0 width=192>
 <col width=64 span=2 style='width:48pt'>
 <col width=96 style='width:72pt'>
 <tr height=20 style='height:15.0pt'>
  <td colspan=2 height=20 class=xl65 width=128>Quarter&nbsp;one</td>
  <td class=xl66>12,5</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td>Apples</td><td>3</td><td>Line<br style='mso-data-placement:same-cell'>two</td>
 </tr>
</table><!--EndFragment--></body></html>`;

const GOOGLE_SHEETS = `<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>
<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none"><colgroup><col width="100"/><col width="120"/></colgroup><tbody>
<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;background-color:#00ff00;font-weight:bold;" rowspan="2">Tall</td><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:middle;color:#1155cc;font-size:14pt;">Blue</td></tr>
<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;"><span style="font-style:italic;">Slanted</span></td></tr>
</tbody></table></google-sheets-html-origin>`;

const LIBREOFFICE = `<table cellspacing="0" border="0"><colgroup width="86"></colgroup>
<tr><td height="17" align="center" valign="middle" bgcolor="#FFFF00"><b><font size=4 color="#FF0000">Heading</font></b></td><td align="left">plain</td></tr>
</table>`;

describe("parseHTMLTable", () => {
  it("reads Excel's class-based formatting, merges and sizes", () => {
    const pasted = parseHTMLTable(EXCEL)!;
    expect(pasted.cells).toHaveLength(2);
    const [heading, covered, number] = pasted.cells[0];
    expect(heading.text).toBe("Quarter one");
    expect(heading.colSpan).toBe(2);
    expect(covered.spannedBy).toEqual({ row: 0, col: 0 });
    expect(heading.style).toMatchObject({
      backgroundColor: "#c00000",
      textColor: "#ffffff",
      fontSize: 18.67,
      bold: true,
      textAlign: "center",
      verticalAlign: "bottom",
    });
    expect(number.style).toMatchObject({ italic: true, textAlign: "right" });
    // windowtext is no colour of its own, and 400 is not bold
    expect(pasted.cells[1][0].style?.textColor).toBeUndefined();
    expect(pasted.cells[1][0].style?.bold).toBeUndefined();
    expect(pasted.cells[1][2].text).toBe("Line\ntwo");
    expect(pasted.colWidths).toEqual([64, 64, 96]);
    expect(pasted.rowHeights).toEqual([20, 20]);
  });

  it("reads Google Sheets' inline styles, row spans and styled spans", () => {
    const pasted = parseHTMLTable(GOOGLE_SHEETS)!;
    const [[tall, blue], [covered, slanted]] = pasted.cells;
    expect(tall.rowSpan).toBe(2);
    expect(covered.spannedBy).toEqual({ row: 0, col: 0 });
    expect(tall.style).toMatchObject({ backgroundColor: "#00ff00", bold: true });
    expect(blue.style).toMatchObject({
      textColor: "#1155cc",
      fontSize: 18.67,
      verticalAlign: "middle",
    });
    expect(slanted.style?.italic).toBe(true);
    expect(pasted.colWidths).toEqual([100, 120]);
    expect(pasted.rowHeights).toEqual([21, 21]);
  });

  it("reads LibreOffice's tags and attributes", () => {
    const [[heading, plain]] = parseHTMLTable(LIBREOFFICE)!.cells;
    expect(heading.text).toBe("Heading");
    expect(heading.style).toMatchObject({
      backgroundColor: "#ffff00",
      textColor: "#ff0000",
      fontSize: 18,
      bold: true,
      textAlign: "center",
      verticalAlign: "middle",
    });
    expect(plain.style).toEqual({ textAlign: "left" });
  });

  it("leaves HTML alone when the table is only part of it", () => {
    expect(
      parseHTMLTable(
        "<p>A long paragraph of copied web page text around the table.</p><table><tr><td>x</td></tr></table>",
      ),
    ).toBeNull();
    expect(parseHTMLTable("<b>no table</b>")).toBeNull();
  });

  it("counts merged cells once", () => {
    expect(pastedCellCount(parseHTMLTable(EXCEL)!)).toBe(5);
  });
});

describe("cssColorToHex", () => {
  it("normalises the ways a colour is written", () => {
    expect(cssColorToHex("#ABC")).toBe("#aabbcc");
    expect(cssColorToHex("rgb(17, 85, 204)")).toBe("#1155cc");
    expect(cssColorToHex("rgba(0,0,0,0)")).toBeNull();
    expect(cssColorToHex("White")).toBe("#ffffff");
    expect(cssColorToHex("windowtext")).toBeNull();
  });
});

describe("pasting a formatted table", () => {
  it("makes a new table at the source's sizes", () => {
    const layout = tableLayoutFromPaste(parseHTMLTable(EXCEL)!);
    expect(layout.colWidths).toEqual([64, 64, 96]);
    // 20px rows are kept as given; text that needs more grows them later
    expect(layout.rowHeights).toEqual([20, 20]);
  });

  it("writes formatting and merges into existing cells, undoing merges it covers", () => {
    const base = newTableElement({ x: 0, y: 0, rows: 3, cols: 3 });
    const merged = {
      ...base,
      cells: base.cells.map((row, r) =>
        row.map((cell, c) =>
          r === 1 && c === 1
            ? { ...cell, text: "old", colSpan: 2 }
            : r === 1 && c === 2
            ? { ...cell, spannedBy: { row: 1, col: 1 } }
            : cell,
        ),
      ),
    };
    const result = fillCellsFromPaste(
      merged,
      { row: 1, col: 1 },
      parseHTMLTable(GOOGLE_SHEETS)!,
    );
    // the old merge is gone; the pasted row span is in its place
    expect(result.cells[1][1]).toMatchObject({ text: "Tall", rowSpan: 2 });
    expect(result.cells[1][1].colSpan).toBeUndefined();
    expect(result.cells[2][1].spannedBy).toEqual({ row: 1, col: 1 });
    expect(result.cells[1][2]).toMatchObject({
      text: "Blue",
      style: { textColor: "#1155cc" },
    });
    // the table grew a row to fit, and kept its own column widths
    expect(result.rowHeights).toHaveLength(3);
    expect(result.colWidths).toEqual(base.colWidths);
  });
});

describe("rangeToHTML", () => {
  it("round-trips formatting and merges through the clipboard", () => {
    const pasted = parseHTMLTable(EXCEL)!;
    const table = newTableElement({
      x: 0,
      y: 0,
      ...tableLayoutFromPaste(pasted),
    });
    const html = rangeToHTML(table, { top: 0, left: 0, bottom: 1, right: 2 });
    const again = parseHTMLTable(html)!;
    expect(again.cells[0][0]).toMatchObject({
      text: "Quarter one",
      colSpan: 2,
      style: { backgroundColor: "#c00000", bold: true },
    });
    expect(again.cells[1][2].text).toBe("Line\ntwo");
    expect(again.colWidths).toEqual([64, 64, 96]);
  });
});
