// Tools for making Flipkart test files, copied from the Amazon ones
// (test/fixtures/sheets/zip-tools.mjs): a zip written with Node's own zlib,
// and pictures placed inside cells the way Excel stores them (exceljs cannot
// write those): xl/metadata.xml, the xl/richData parts and vm="N" on the
// cells. Also a tiny made-up picture, drawn here.

import { deflateRawSync, deflateSync, crc32 } from 'node:zlib';
import { readZip } from '../../../flipkart/zip.js';

/** A zip, written with Node's own zlib: [name, bytes] in order. */
export function writeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data);
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RD = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';

/**
 * Puts pictures inside cells, as Excel does: cells is [{ ref, media }] with
 * media an xl/media name; media is [[name, bytes]]. `part` is the worksheet
 * that holds the cells.
 */
export function placeInCells(zipBuf, cells, media, part = 'xl/worksheets/sheet1.xml') {
  const zip = readZip(zipBuf);
  const files = new Map([...zip.keys()].map((k) => [k, zip.get(k)()]));
  const text = (k) => files.get(k).toString('utf8');

  let sheet = text(part);
  cells.forEach((c, i) => {
    const re = new RegExp(`<c r="${c.ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
    if (!re.test(sheet)) throw new Error(`no cell ${c.ref}`);
    sheet = sheet.replace(re, `<c r="${c.ref}" t="e" vm="${i + 1}"><v>#VALUE!</v></c>`);
  });
  files.set(part, Buffer.from(sheet));

  const bk = (i) => `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${i}"/></ext></extLst></bk>`;
  files.set(
    'xl/metadata.xml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<metadata xmlns="${NS}" xmlns:xlrd="${RD}"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="${cells.length}">${cells.map((_, i) => bk(i)).join('')}</futureMetadata><valueMetadata count="${cells.length}">${cells.map((_, i) => `<bk><rc t="1" v="${i}"/></bk>`).join('')}</valueMetadata></metadata>`),
  );
  files.set('xl/richData/rdrichvalue.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rvData xmlns="${RD}" count="${cells.length}">${cells.map((_, i) => `<rv s="0"><v>${i}</v><v>5</v></rv>`).join('')}</rvData>`));
  files.set('xl/richData/rdrichvaluestructure.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rvStructures xmlns="${RD}" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>`));
  files.set('xl/richData/richValueRel.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${cells.map((_, i) => `<rel r:id="rId${i + 1}"/>`).join('')}</richValueRels>`));
  files.set('xl/richData/_rels/richValueRel.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${cells.map((c, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${c.media}"/>`).join('')}</Relationships>`));
  for (const [name, data] of media) files.set(`xl/media/${name}`, data);

  let rels = text('xl/_rels/workbook.xml.rels');
  rels = rels.replace(
    '</Relationships>',
    '<Relationship Id="rIdMeta" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/>' +
      '<Relationship Id="rIdRvRel" Type="http://schemas.microsoft.com/office/2022/10/relationships/richValueRel" Target="richData/richValueRel.xml"/>' +
      '<Relationship Id="rIdRv" Type="http://schemas.microsoft.com/office/2017/06/relationships/rdRichValue" Target="richData/rdrichvalue.xml"/>' +
      '<Relationship Id="rIdRvS" Type="http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueStructure" Target="richData/rdrichvaluestructure.xml"/>' +
      '</Relationships>',
  );
  files.set('xl/_rels/workbook.xml.rels', Buffer.from(rels));

  let types = text('[Content_Types].xml');
  for (const [ext, type] of [['png', 'image/png'], ['jpg', 'image/jpeg']]) {
    if (!types.includes(`Extension="${ext}"`)) types = types.replace('<Override', `<Default Extension="${ext}" ContentType="${type}"/><Override`);
  }
  types = types.replace(
    '</Types>',
    '<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/>' +
      '<Override PartName="/xl/richData/rdrichvalue.xml" ContentType="application/vnd.ms-excel.rdrichvalue+xml"/>' +
      '<Override PartName="/xl/richData/rdrichvaluestructure.xml" ContentType="application/vnd.ms-excel.rdrichvaluestructure+xml"/>' +
      '<Override PartName="/xl/richData/richValueRel.xml" ContentType="application/vnd.ms-excel.richvaluerel+xml"/>' +
      '</Types>',
  );
  files.set('[Content_Types].xml', Buffer.from(types));
  return writeZip([...files.entries()]);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A made-up picture: a 4 by 4 square of one colour, as a PNG file. */
export function tinyPng([r, g, b] = [246, 207, 95]) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(4, 0);
  head.writeUInt32BE(4, 4);
  head[8] = 8; // 8 bits for each colour
  head[9] = 2; // red, green and blue
  const line = Buffer.from([0, ...Array.from({ length: 4 }, () => [r, g, b]).flat()]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', head), pngChunk('IDAT', deflateSync(Buffer.concat([line, line, line, line]))), pngChunk('IEND', Buffer.alloc(0))]);
}
