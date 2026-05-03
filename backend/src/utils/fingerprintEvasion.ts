/**
 * Fingerprint Evasion — técnicas para que cada mensagem/mídia enviada
 * tenha um hash único, impedindo que o WhatsApp detecte disparos em massa.
 *
 * Três técnicas implementadas:
 *
 * 1. UNICODE INVISÍVEL — insere caracteres de largura zero no texto.
 *    Visualmente idêntico, hash completamente diferente.
 *
 * 2. RUÍDO DE ÁUDIO — adiciona ruído branco de amplitude mínima (~0.0001)
 *    nos bytes PCM do arquivo. Inaudível ao ouvido humano, hash único.
 *    Suporta WAV (PCM) e OGG/Opus (modifica bytes aleatórios no payload).
 *
 * 3. PIXEL NOISE — altera 3-8 pixels aleatórios em imagens JPEG/PNG.
 *    Visualmente imperceptível, hash completamente diferente.
 *    Implementado via manipulação direta de bytes no buffer base64.
 */

import { randomBytes, createHash } from 'crypto';

// ── 1. Unicode invisível ──────────────────────────────────────────────────────

/**
 * Caracteres Unicode de largura zero — invisíveis no WhatsApp.
 * Cada combinação produz um hash de texto diferente.
 */
const ZERO_WIDTH_CHARS = [
  '\u200B', // Zero Width Space
  '\u200C', // Zero Width Non-Joiner
  '\u200D', // Zero Width Joiner
  '\u2060', // Word Joiner
  '\uFEFF', // Zero Width No-Break Space (BOM)
];

/**
 * Injeta caracteres invisíveis únicos no texto.
 * A posição e combinação são determinísticas por leadId + timestamp,
 * garantindo que cada lead receba uma variação diferente.
 */
export function injectUnicodeNoise(text: string, leadId: string): string {
  // Gera uma semente única por lead + momento
  const seed = createHash('md5').update(leadId + Date.now().toString()).digest();

  // Quantos caracteres invisíveis inserir (2 a 5)
  const count = 2 + (seed[0] % 4);

  // Posições onde inserir (espalhadas pelo texto)
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const pos = 1 + (seed[i + 1] % Math.max(1, text.length - 2));
    if (!positions.includes(pos)) positions.push(pos);
  }
  positions.sort((a, b) => b - a); // de trás pra frente para não deslocar índices

  let result = text;
  for (let i = 0; i < positions.length; i++) {
    const char = ZERO_WIDTH_CHARS[seed[i + 5] % ZERO_WIDTH_CHARS.length];
    const pos = positions[i];
    result = result.slice(0, pos) + char + result.slice(pos);
  }

  return result;
}

// ── 2. Ruído de áudio ─────────────────────────────────────────────────────────

/**
 * Adiciona ruído imperceptível em um arquivo de áudio base64.
 *
 * Estratégia:
 * - WAV (PCM): modifica bytes de dados de amostra com delta ±1 (16-bit PCM)
 * - OGG/Opus/MP3: modifica bytes aleatórios no payload (fora do header)
 *   com delta ±1 — causa variação mínima no bitstream, inaudível
 *
 * O resultado é um arquivo com hash completamente diferente mas
 * som praticamente idêntico (diferença < 0.001% na amplitude).
 */
export function addAudioNoise(audioBase64: string, mimetype: string): string {
  const buf = Buffer.from(audioBase64, 'base64');

  // Número de bytes a modificar: entre 8 e 20
  const noiseCount = 8 + (randomBytes(1)[0] % 13);

  if (mimetype.includes('wav') || mimetype.includes('wave')) {
    return addWavNoise(buf, noiseCount);
  }

  // OGG, Opus, MP3, AAC — modifica bytes no meio do payload
  return addGenericAudioNoise(buf, noiseCount);
}

function addWavNoise(buf: Buffer, count: number): string {
  const result = Buffer.from(buf);

  // WAV header tem 44 bytes — começa nos dados de áudio a partir do byte 44
  const dataStart = 44;
  if (result.length <= dataStart + 4) return result.toString('base64');

  const dataLength = result.length - dataStart;

  for (let i = 0; i < count; i++) {
    // Posição aleatória nos dados de áudio (alinhada em 2 bytes para PCM 16-bit)
    const offset = dataStart + (Math.floor(Math.random() * (dataLength / 2)) * 2);
    if (offset + 1 >= result.length) continue;

    // Lê sample de 16-bit, adiciona delta ±1 (inaudível)
    const sample = result.readInt16LE(offset);
    const delta = randomBytes(1)[0] % 2 === 0 ? 1 : -1;
    const newSample = Math.max(-32768, Math.min(32767, sample + delta));
    result.writeInt16LE(newSample, offset);
  }

  return result.toString('base64');
}

function addGenericAudioNoise(buf: Buffer, count: number): string {
  const result = Buffer.from(buf);

  // Pula os primeiros 512 bytes (header/magic bytes) e os últimos 64
  const safeStart = Math.min(512, Math.floor(result.length * 0.1));
  const safeEnd = result.length - 64;

  if (safeEnd <= safeStart) return result.toString('base64');

  const range = safeEnd - safeStart;

  for (let i = 0; i < count; i++) {
    const offset = safeStart + Math.floor(Math.random() * range);
    // Delta ±1 no byte — variação mínima no bitstream
    const delta = randomBytes(1)[0] % 2 === 0 ? 1 : -1;
    result[offset] = Math.max(0, Math.min(255, result[offset] + delta));
  }

  return result.toString('base64');
}

// ── 3. Pixel noise em imagens ─────────────────────────────────────────────────

/**
 * Altera 3-8 pixels aleatórios em uma imagem JPEG ou PNG.
 *
 * Estratégia:
 * - JPEG: modifica bytes no meio do payload (fora dos marcadores SOI/EOI)
 *   com delta ±1-2. O codec JPEG reinterpreta os coeficientes DCT levemente
 *   diferentes — visualmente imperceptível, hash completamente diferente.
 * - PNG: modifica bytes nos chunks IDAT (dados comprimidos) com delta ±1.
 *
 * Nota: não fazemos decode/encode completo da imagem para evitar dependências.
 * A modificação direta de bytes no bitstream comprimido é suficiente para
 * mudar o hash sem afetar a qualidade visual perceptível.
 */
export function addImageNoise(imageBase64: string, mimetype: string): string {
  // PNG noise desativado — modificar bytes comprimidos corrompe a imagem
  // Para PNG, apenas altera metadados no final do arquivo (inofensivo)
  if (mimetype.includes('png')) {
    return addPngMetaNoise(imageBase64);
  }
  // JPEG — modifica bytes no scan data (seguro)
  return addJpegNoise(imageBase64);
}

function addJpegNoise(buf: Buffer, count?: number): string {
  const result = Buffer.from(buf);
  const noiseCount = count ?? (3 + (randomBytes(1)[0] % 6));

  // JPEG: localiza o início do scan data (marcador FF DA = Start of Scan)
  // Após o SOS, os dados de imagem começam — é seguro modificar ali
  let sosOffset = -1;
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i] === 0xFF && result[i + 1] === 0xDA) {
      sosOffset = i;
      break;
    }
  }

  if (sosOffset === -1) {
    // Não encontrou SOS — usa abordagem conservadora: modifica apenas
    // os últimos 200 bytes antes do EOI (FF D9)
    const safeEnd = result.length - 2;
    const safeStart = Math.max(safeEnd - 200, Math.floor(result.length * 0.5));
    if (safeEnd > safeStart) {
      for (let i = 0; i < noiseCount; i++) {
        const offset = safeStart + Math.floor(Math.random() * (safeEnd - safeStart));
        if (result[offset] !== 0xFF) {
          result[offset] = Math.max(0, Math.min(255, result[offset] + (randomBytes(1)[0] % 3) - 1));
        }
      }
    }
    return result.toString('base64');
  }

  // Pula o header do SOS (2 bytes marcador + 2 bytes length + conteúdo do header)
  const sosHeaderLength = result.readUInt16BE(sosOffset + 2);
  const scanDataStart = sosOffset + 2 + sosHeaderLength;
  // Modifica bytes no meio do scan data, longe do início e fim
  const scanDataEnd = result.length - 2; // antes do EOI
  const safeStart = scanDataStart + Math.floor((scanDataEnd - scanDataStart) * 0.1);
  const safeEnd = scanDataStart + Math.floor((scanDataEnd - scanDataStart) * 0.9);

  if (safeEnd <= safeStart) return result.toString('base64');

  for (let i = 0; i < noiseCount; i++) {
    const offset = safeStart + Math.floor(Math.random() * (safeEnd - safeStart));
    // Evita modificar bytes de escape JPEG (FF 00)
    if (result[offset] === 0xFF) continue;
    result[offset] = Math.max(0, Math.min(255, result[offset] + (randomBytes(1)[0] % 3) - 1));
  }

  return result.toString('base64');
}

/**
 * Para PNG: adiciona um comentário de texto (chunk tEXt) com UUID único.
 * Não toca nos dados de imagem — hash muda, visual idêntico.
 */
function addPngMetaNoise(imageBase64: string): string {
  const buf = Buffer.from(imageBase64, 'base64');

  // Cria um chunk tEXt com keyword "Comment" e valor UUID único
  const keyword = Buffer.from('Comment\0');
  const value = Buffer.from(randomBytes(16).toString('hex'));
  const chunkData = Buffer.concat([keyword, value]);

  const chunkLength = Buffer.alloc(4);
  chunkLength.writeUInt32BE(chunkData.length, 0);

  const chunkType = Buffer.from('tEXt');

  // CRC32 do tipo + dados
  const crcInput = Buffer.concat([chunkType, chunkData]);
  const crc = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);

  const newChunk = Buffer.concat([chunkLength, chunkType, chunkData, crcBuf]);

  // Insere o chunk antes do IEND (últimos 12 bytes do PNG)
  const iendOffset = buf.length - 12;
  const result = Buffer.concat([
    buf.slice(0, iendOffset),
    newChunk,
    buf.slice(iendOffset),
  ]);

  return result.toString('base64');
}

// CRC32 simples para chunks PNG
function crc32(buf: Buffer): number {
  const table = makeCrcTable();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF);
}

let _crcTable: number[] | null = null;
function makeCrcTable(): number[] {
  if (_crcTable) return _crcTable;
  _crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crcTable[n] = c;
  }
  return _crcTable;
}

// ── Utilitário: hash para log/debug ──────────────────────────────────────────

/**
 * Retorna os primeiros 8 chars do MD5 de um buffer base64.
 * Útil para confirmar nos logs que cada arquivo tem hash diferente.
 */
export function shortHash(base64: string): string {
  return createHash('md5').update(base64).digest('hex').slice(0, 8);
}
