'use strict';

// 1. Convert regional Indian numerals (Devanagari, Bengali, Tamil, Telugu, etc.) to 0-9
function normalizeIndicDigits(str) {
  if (!str) return '';
  return str
    .replace(/[\u0966-\u096F]/g, d => d.charCodeAt(0) - 0x0966) // Devanagari (Hindi, Marathi, Sanskrit)
    .replace(/[\u09E6-\u09EF]/g, d => d.charCodeAt(0) - 0x09E6) // Bengali & Assamese
    .replace(/[\u0A66-\u0A6F]/g, d => d.charCodeAt(0) - 0x0A66) // Gurmukhi (Punjabi)
    .replace(/[\u0AE6-\u0AEF]/g, d => d.charCodeAt(0) - 0x0AE6) // Gujarati
    .replace(/[\u0B66-\u0B6F]/g, d => d.charCodeAt(0) - 0x0B66) // Odia
    .replace(/[\u0BE6-\u0BEF]/g, d => d.charCodeAt(0) - 0x0BE6) // Tamil
    .replace(/[\u0C66-\u0C6F]/g, d => d.charCodeAt(0) - 0x0C66) // Telugu
    .replace(/[\u0CE6-\u0CEF]/g, d => d.charCodeAt(0) - 0x0CE6) // Kannada
    .replace(/[\u0D66-\u0D6F]/g, d => d.charCodeAt(0) - 0x0D66) // Malayalam
    .replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x06F0); // Urdu
}

// 2. All-State Multilingual Keywords (Covers 36 States & UTs)
const MULTI_LANG_DATE_PATTERNS = [
  /(?:last\s*date|closing\s*date|deadline|apply\s*upto)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:अंतिम\s*तिथि|समाप्ति\s*दिनांक|आवेदन\s*की\s*अंतिम\s*तारीख)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:शेवटची\s*तारीख|अर्ज\s*करण्याची\s*शेवटची\s*तारीख|मुदत)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:শেষ\s*তারিখ|আবেদনের\s*শেষ\s*দিন|অন্তিম\s*তাৰিখ)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:છેલ્લી\s*તારીખ|અરજી\s*કરવાની\s*છેલ્લી\s*તારીખ|મુદત)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:ਆਖਰੀ\s*ਮਿਤੀ|ਆਖ਼ਰੀ\s*ਤਾਰੀਖ|ਅਰਜ਼ੀ\s*ਦੀ\s*ਆਖਰੀ\s*ਮਿਤੀ)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:ଶେଷ\s*ତାରିଖ|ଆବେଦନର\s*ଶେଷ\s*ତାରିଖ)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:கடைசி\s*தேதி|விண்ணப்பிக்க\s*இறுதி\s*நாள்|முடிவு\s*தேதி)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:చివరి\s*తేదీ|దరఖాస్తు\s*చివరి\s*తేదీ)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:ಕೊನೆಯ\s*ದಿನಾಂಕ|ಅರ್ಜಿ\s*ಸಲ್ಲಿಸಲು\s*ಕೊನೆಯ\s*ದಿನಾಂಕ)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:അവസാന\s*തീയതി|അപേക്ഷിക്കേണ്ട\s*അവസാന\s*തീയതി)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(?:آخری\s*تاریخ|درخواست\s*کی\s*آخری\s*تاریخ)[\s:=]+(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i
];

const MULTI_LANG_VACANCY_PATTERNS = [
  /(?:total\s*(?:vacanc(?:y|ies)|posts?)|no\.?\s*of\s*posts?)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:posts?|vacancies)/i,
  /(?:कुल\s*पद|कुल\s*रिक्तियां|रिक्त\s*पदों\s*की\s*संख्या)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:पद|रिक्तियां)/i,
  /(?:एकूण\s*पदे|एकूण\s*जागा|रिक्त\s*पदे)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:पदे|जागा)/i,
  /(?:মোট\s*পদ|মোট\s*শূন্যপদ|খালী\s*পদ)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:টি\s*পদ|টি\s*শূন্যপদ)/i,
  /(?:કુલ\s*જગ્યાઓ|કુલ\s*પદો)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:જગ્યાઓ|પદો)/i,
  /(?:ਕੁੱਲ\s*ਅਸਾਮੀਆਂ|ਕੁੱਲ\s*ਪੋਸਟਾਂ)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:ਅਸਾਮੀਆਂ|ਪੋਸਟਾਂ)/i,
  /(?:ମୋଟ\s*ପଦବୀ|ଖାଲି\s*ଥିବା\s*ପଦବୀ)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:ପଦବୀ)/i,
  /(?:மொத்த\s*காலியிடங்கள்|பணியிடங்கள்)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:காலியிடங்கள்|பணியிடங்கள்)/i,
  /(?:మొత్తం\s*ఖాళీలు|మొత్తం\s*పోస్టులు)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:ఖాళీలు|పోస్టులు)/i,
  /(?:ಒಟ್ಟು\s*ಹುದ್ದೆಗಳು|ಖಾಲಿ\s*ಹುದ್ದೆಗಳು)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:ಹುದ್ದೆಗಳು)/i,
  /(?:ആകെ\s*ഒഴിവുകൾ|ഒഴിവുകളുടെ\s*എണ്ണം)[\s:=]+(\d{1,6})/i,
  /(\d{1,6})\s*(?:ഒഴിവുകൾ)/i,
  /(?:کل\s*آسامیاں|خالی\s*جگہوں\s*کی\s*تعداد)[\s:=]+(\d{1,6})/i
];

const MULTI_LANG_FEE_PATTERNS = [
  /(?:application\s*fee|fee|शुल्क|फीस|फी|શુલ્ક|ఫీజు|ಶುಲ್ಕ|கட்டணம்|ഫീസ്|فیس)[\s:=]+(?:rs\.?|₹)?\s*(\d{1,5})/i
];

function detectScript(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'Hindi / Devanagari';
  if (/[\u0980-\u09FF]/.test(text)) return 'Bengali / Assamese';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'Punjabi';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'Gujarati';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'Odia';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Telugu';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'Kannada';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'Malayalam';
  if (/[\u0600-\u06FF]/.test(text)) return 'Urdu';
  return 'English';
}

function extractMetaFromText(rawText) {
  const normalized = normalizeIndicDigits(rawText).replace(/\s+/g, ' ');
  const script = detectScript(rawText);

  let lastDate = null;
  for (const regex of MULTI_LANG_DATE_PATTERNS) {
    const m = normalized.match(regex);
    if (m && m[1]) { lastDate = m[1]; break; }
  }

  let totalVacancies = null;
  for (const regex of MULTI_LANG_VACANCY_PATTERNS) {
    const m = normalized.match(regex);
    if (m && m[1]) { totalVacancies = m[1]; break; }
  }

  let fee = null;
  for (const regex of MULTI_LANG_FEE_PATTERNS) {
    const m = normalized.match(regex);
    if (m && m[1]) { fee = m[1]; break; }
  }

  return { lastDate, totalVacancies, fee, script };
}

async function parsePdf(buffer) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return extractMetaFromText(data.text);
  } catch (_) {
    return { lastDate: null, totalVacancies: null, fee: null, script: 'Unknown' };
  }
}

function parseExcel(buffer) {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1 });
    const combinedText = rawData.flat().join(' ');
    return extractMetaFromText(combinedText);
  } catch (_) {
    return { lastDate: null, totalVacancies: null, fee: null, script: 'Unknown' };
  }
}

module.exports = {
  normalizeIndicDigits,
  detectScript,
  extractMetaFromText,
  parsePdf,
  parseExcel
};
