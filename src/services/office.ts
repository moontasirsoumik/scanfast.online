/**
 * @module Office, OpenDocument, and EPUB format generators.
 * All formats are ZIP-based and generated entirely client-side.
 * DOCX/PPTX/ODT/ODP embed page images; XLSX/ODS/EPUB use extracted text.
 */

import { createZip } from './zip';
import { exportPageAsImage, type PageData } from './pdf';

/** Escape special XML characters. */
function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** Max content width for A4 DOCX/ODT in EMU (~6.27 inches). */
const DOC_MAX_W = 5_727_060;

/** PPTX/ODP slide dimensions in EMU (10" × 7.5"). */
const SLIDE_W = 9_144_000;
const SLIDE_H = 6_858_000;

// ─── Shared helpers ──────────────────────────────────────────────────

interface RenderedImage {
	data: Uint8Array;
	w: number;
	h: number;
}

/** Render pages as JPEG images with pixel dimensions. */
async function renderImages(pages: PageData[]): Promise<RenderedImage[]> {
	const out: RenderedImage[] = [];
	for (const page of pages) {
		const blob = await exportPageAsImage(page, 'jpeg', 0.92);
		const bmp = await createImageBitmap(blob);
		out.push({ data: new Uint8Array(await blob.arrayBuffer()), w: bmp.width, h: bmp.height });
		bmp.close();
	}
	return out;
}

/** Split extracted text (with --- Page N --- delimiters) into per-page strings. */
export function splitTextPages(text: string): string[] {
	if (!text.trim()) return [];
	return text.split(/---\s*Page\s+\d+\s*---/i).filter((s) => s.trim()).map((s) => s.trim());
}

// ─── DOCX (image-embedded) ──────────────────────────────────────────

const OOXML_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OOXML_DOC_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const OOXML_IMG_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

/**
 * Export pages as a Word document (.docx) with each page embedded as an image.
 */
export async function exportAsDocx(pages: PageData[]): Promise<Blob> {
	const images = await renderImages(pages);

	const imgRels = images.map((_, i) =>
		`<Relationship Id="rId${i + 1}" Type="${OOXML_IMG_TYPE}" Target="media/image${i + 1}.jpeg"/>`
	).join('');

	const body = images.map((img, i) => {
		const aspect = img.h / img.w;
		const cx = DOC_MAX_W;
		const cy = Math.round(cx * aspect);
		const pb = i > 0 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '';
		return `${pb}<w:p><w:r><w:drawing>
<wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${cx}" cy="${cy}"/>
<wp:docPr id="${i + 1}" name="Page ${i + 1}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${i + 1}" name="image${i + 1}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
	}).join('\n');

	const entries: { name: string; blob: Blob }[] = [
		{
			name: '[Content_Types].xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`]),
		},
		{
			name: '_rels/.rels',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">
<Relationship Id="rId1" Type="${OOXML_DOC_TYPE}" Target="word/document.xml"/>
</Relationships>`]),
		},
		{
			name: 'word/_rels/document.xml.rels',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">${imgRels}</Relationships>`]),
		},
		{
			name: 'word/document.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body}</w:body></w:document>`]),
		},
	];

	for (let i = 0; i < images.length; i++) {
			entries.push({ name: `word/media/image${i + 1}.jpeg`, blob: new Blob([images[i].data.buffer as ArrayBuffer]) });
	}

	return createZip(entries);
}

// ─── PPTX (image-embedded) ──────────────────────────────────────────

const PPTX_SLIDE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const PPTX_MASTER_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster';
const PPTX_LAYOUT_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';

/**
 * Export pages as a PowerPoint presentation (.pptx) with each page as a slide image.
 */
export async function exportAsPptx(pages: PageData[]): Promise<Blob> {
	const images = await renderImages(pages);
	const entries: { name: string; blob: Blob }[] = [];

	// [Content_Types].xml
	const slideOverrides = images.map((_, i) =>
		`<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
	).join('');

	entries.push({
		name: '[Content_Types].xml',
		blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
${slideOverrides}
</Types>`]),
	});

	// _rels/.rels
	entries.push({
		name: '_rels/.rels',
		blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">
<Relationship Id="rId1" Type="${OOXML_DOC_TYPE}" Target="ppt/presentation.xml"/>
</Relationships>`]),
	});

	// ppt/presentation.xml
	const slideIds = images.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
	entries.push({
		name: 'ppt/presentation.xml',
		blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${slideIds}</p:sldIdLst>
<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/>
<p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
</p:presentation>`]),
	});

	// ppt/_rels/presentation.xml.rels
	const presRels = [`<Relationship Id="rId1" Type="${PPTX_MASTER_TYPE}" Target="slideMasters/slideMaster1.xml"/>`];
	images.forEach((_, i) => {
		presRels.push(`<Relationship Id="rId${i + 2}" Type="${PPTX_SLIDE_TYPE}" Target="slides/slide${i + 1}.xml"/>`);
	});
	entries.push({
		name: 'ppt/_rels/presentation.xml.rels',
		blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">${presRels.join('')}</Relationships>`]),
	});

	// Slide master + layout
	entries.push({
		name: 'ppt/slideMasters/slideMaster1.xml',
		blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`]),
	});

	entries.push({
		name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
		blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">
<Relationship Id="rId1" Type="${PPTX_LAYOUT_TYPE}" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`]),
	});

	entries.push({
		name: 'ppt/slideLayouts/slideLayout1.xml',
		blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`]),
	});

	entries.push({
		name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
		blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">
<Relationship Id="rId1" Type="${PPTX_MASTER_TYPE}" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`]),
	});

	// Per-slide files
	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		const aspect = img.w / img.h;
		let cx: number, cy: number, ox: number, oy: number;
		if (aspect > SLIDE_W / SLIDE_H) {
			cx = SLIDE_W; cy = Math.round(cx / aspect); ox = 0; oy = Math.round((SLIDE_H - cy) / 2);
		} else {
			cy = SLIDE_H; cx = Math.round(cy * aspect); ox = Math.round((SLIDE_W - cx) / 2); oy = 0;
		}

		entries.push({
			name: `ppt/slides/slide${i + 1}.xml`,
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${i + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="${ox}" y="${oy}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic></p:spTree></p:cSld></p:sld>`]),
		});

		entries.push({
			name: `ppt/slides/_rels/slide${i + 1}.xml.rels`,
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">
<Relationship Id="rId1" Type="${PPTX_LAYOUT_TYPE}" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="${OOXML_IMG_TYPE}" Target="../media/image${i + 1}.jpeg"/>
</Relationships>`]),
		});

		entries.push({ name: `ppt/media/image${i + 1}.jpeg`, blob: new Blob([img.data.buffer as ArrayBuffer]) });
	}

	return createZip(entries);
}

// ─── XLSX (text-based) ──────────────────────────────────────────────

/**
 * Export extracted text as an Excel spreadsheet (.xlsx).
 * @param pageTexts - Array of text per page (from splitTextPages)
 */
export async function exportAsXlsx(pageTexts: string[]): Promise<Blob> {
	// Shared strings
	const strings = pageTexts.map((t) => `<si><t>${esc(t)}</t></si>`).join('');
	const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${pageTexts.length}" uniqueCount="${pageTexts.length}">
${strings}</sst>`;

	// Sheet rows: column A = page number, column B = text
	const rows = pageTexts.map((_, i) =>
		`<row r="${i + 2}"><c r="A${i + 2}" t="n"><v>${i + 1}</v></c><c r="B${i + 2}" t="s"><v>${i}</v></c></row>`
	).join('');

	const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Page</t></is></c><c r="B1" t="inlineStr"><is><t>Content</t></is></c></row>
${rows}
</sheetData></worksheet>`;

	const entries: { name: string; blob: Blob }[] = [
		{
			name: '[Content_Types].xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`]),
		},
		{
			name: '_rels/.rels',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">
<Relationship Id="rId1" Type="${OOXML_DOC_TYPE}" Target="xl/workbook.xml"/>
</Relationships>`]),
		},
		{
			name: 'xl/_rels/workbook.xml.rels',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${OOXML_REL}">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`]),
		},
		{
			name: 'xl/workbook.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Pages" sheetId="1" r:id="rId1"/></sheets></workbook>`]),
		},
		{ name: 'xl/worksheets/sheet1.xml', blob: new Blob([sheet]) },
		{ name: 'xl/sharedStrings.xml', blob: new Blob([sharedStrings]) },
	];

	return createZip(entries);
}

// ─── ODT (image-embedded) ───────────────────────────────────────────

const ODF_NS = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
xmlns:xlink="http://www.w3.org/1999/xlink"
xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"`;

/**
 * Export pages as an OpenDocument text file (.odt) with embedded images.
 */
export async function exportAsOdt(pages: PageData[]): Promise<Blob> {
	const images = await renderImages(pages);

	const frames = images.map((img, i) => {
		const aspect = img.h / img.w;
		const wCm = 17; // A4 content width approx
		const hCm = (wCm * aspect).toFixed(2);
		return `<text:p text:style-name="Standard"><draw:frame draw:name="Page ${i + 1}" text:anchor-type="paragraph" svg:width="${wCm}cm" svg:height="${hCm}cm"><draw:image xlink:href="Pictures/image${i + 1}.jpeg" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`;
	}).join('\n');

	const manifest = images.map((_, i) =>
		`<manifest:file-entry manifest:full-path="Pictures/image${i + 1}.jpeg" manifest:media-type="image/jpeg"/>`
	).join('\n');

	const entries: { name: string; blob: Blob }[] = [
		{ name: 'mimetype', blob: new Blob(['application/vnd.oasis.opendocument.text']) },
		{
			name: 'META-INF/manifest.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
${manifest}
</manifest:manifest>`]),
		},
		{
			name: 'content.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${ODF_NS} office:version="1.2">
<office:body><office:text>${frames}</office:text></office:body>
</office:document-content>`]),
		},
	];

	for (let i = 0; i < images.length; i++) {
		entries.push({ name: `Pictures/image${i + 1}.jpeg`, blob: new Blob([images[i].data.buffer as ArrayBuffer]) });
	}

	return createZip(entries);
}

// ─── ODP (image-embedded) ───────────────────────────────────────────

const ODP_NS = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
xmlns:xlink="http://www.w3.org/1999/xlink"
xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"`;

/**
 * Export pages as an OpenDocument presentation (.odp) with embedded images.
 */
export async function exportAsOdp(pages: PageData[]): Promise<Blob> {
	const images = await renderImages(pages);
	const slideWcm = 25.4; // 10 inches
	const slideHcm = 19.05; // 7.5 inches

	const slides = images.map((img, i) => {
		const aspect = img.w / img.h;
		let w: number, h: number, x: number, y: number;
		if (aspect > slideWcm / slideHcm) {
			w = slideWcm; h = w / aspect; x = 0; y = (slideHcm - h) / 2;
		} else {
			h = slideHcm; w = h * aspect; x = (slideWcm - w) / 2; y = 0;
		}
		return `<draw:page draw:name="Slide ${i + 1}">
<draw:frame svg:x="${x.toFixed(2)}cm" svg:y="${y.toFixed(2)}cm" svg:width="${w.toFixed(2)}cm" svg:height="${h.toFixed(2)}cm">
<draw:image xlink:href="Pictures/image${i + 1}.jpeg" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>
</draw:frame></draw:page>`;
	}).join('\n');

	const manifest = images.map((_, i) =>
		`<manifest:file-entry manifest:full-path="Pictures/image${i + 1}.jpeg" manifest:media-type="image/jpeg"/>`
	).join('\n');

	const entries: { name: string; blob: Blob }[] = [
		{ name: 'mimetype', blob: new Blob(['application/vnd.oasis.opendocument.presentation']) },
		{
			name: 'META-INF/manifest.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
${manifest}
</manifest:manifest>`]),
		},
		{
			name: 'content.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${ODP_NS} office:version="1.2">
<office:body><office:presentation>${slides}</office:presentation></office:body>
</office:document-content>`]),
		},
	];

	for (let i = 0; i < images.length; i++) {
		entries.push({ name: `Pictures/image${i + 1}.jpeg`, blob: new Blob([images[i].data.buffer as ArrayBuffer]) });
	}

	return createZip(entries);
}

// ─── ODS (text-based) ───────────────────────────────────────────────

/**
 * Export extracted text as an OpenDocument spreadsheet (.ods).
 * @param pageTexts - Array of text per page
 */
export async function exportAsOds(pageTexts: string[]): Promise<Blob> {
	const rows = pageTexts.map((t, i) =>
		`<table:table-row><table:table-cell office:value-type="float" office:value="${i + 1}"><text:p>${i + 1}</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>${esc(t)}</text:p></table:table-cell></table:table-row>`
	).join('\n');

	const entries: { name: string; blob: Blob }[] = [
		{ name: 'mimetype', blob: new Blob(['application/vnd.oasis.opendocument.spreadsheet']) },
		{
			name: 'META-INF/manifest.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`]),
		},
		{
			name: 'content.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" office:version="1.2">
<office:body><office:spreadsheet>
<table:table table:name="Pages">
<table:table-row><table:table-cell office:value-type="string"><text:p>Page</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Content</text:p></table:table-cell></table:table-row>
${rows}
</table:table>
</office:spreadsheet></office:body></office:document-content>`]),
		},
	];

	return createZip(entries);
}

// ─── EPUB (text-based) ──────────────────────────────────────────────

/**
 * Export extracted text as an EPUB ebook.
 * @param pageTexts - Array of text per page
 */
export async function exportAsEpub(pageTexts: string[]): Promise<Blob> {
	const uid = crypto.randomUUID();

	// Spine items
	const manifestItems = pageTexts.map((_, i) =>
		`<item id="ch${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
	).join('\n');
	const spineItems = pageTexts.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join('\n');
	const navPoints = pageTexts.map((_, i) =>
		`<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>Page ${i + 1}</text></navLabel><content src="chapter${i + 1}.xhtml"/></navPoint>`
	).join('\n');
	const navLi = pageTexts.map((_, i) =>
		`<li><a href="chapter${i + 1}.xhtml">Page ${i + 1}</a></li>`
	).join('\n');

	const entries: { name: string; blob: Blob }[] = [
		{ name: 'mimetype', blob: new Blob(['application/epub+zip']) },
		{
			name: 'META-INF/container.xml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`]),
		},
		{
			name: 'OEBPS/content.opf',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${uid}</dc:identifier>
<dc:title>ScanFast Export</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
${manifestItems}
</manifest>
<spine>${spineItems}</spine>
</package>`]),
		},
		{
			name: 'OEBPS/toc.ncx',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${uid}"/></head>
<docTitle><text>ScanFast Export</text></docTitle>
<navMap>${navPoints}</navMap></ncx>`]),
		},
		{
			name: 'OEBPS/nav.xhtml',
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body><nav epub:type="toc"><h1>Contents</h1><ol>${navLi}</ol></nav></body></html>`]),
		},
		{
			name: 'OEBPS/style.css',
			blob: new Blob([`body{font-family:Georgia,serif;margin:1em;line-height:1.6;color:#333}h1{color:#0f62fe;font-size:1.2em}p{white-space:pre-wrap}`]),
		},
	];

	// Chapter files
	for (let i = 0; i < pageTexts.length; i++) {
		entries.push({
			name: `OEBPS/chapter${i + 1}.xhtml`,
			blob: new Blob([`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Page ${i + 1}</title><link rel="stylesheet" href="style.css"/></head>
<body><h1>Page ${i + 1}</h1><p>${esc(pageTexts[i])}</p></body></html>`]),
		});
	}

	return createZip(entries);
}
