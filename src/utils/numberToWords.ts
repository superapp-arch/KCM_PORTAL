// Converts a rupee amount into words using the Indian numbering system
// (Lakh/Crore, not Million/Billion) - used for the Salary Slip's "Amount in
// Words" line. Rounds to the nearest whole rupee (standard payslip
// convention - paise are not spelled out).

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigitsToWords(n: number): string {
  let result = '';
  if (n >= 100) {
    result += `${ONES[Math.floor(n / 100)]} Hundred`;
    n %= 100;
    if (n > 0) result += ' ';
  }
  if (n >= 20) {
    result += TENS[Math.floor(n / 10)];
    if (n % 10 > 0) result += ` ${ONES[n % 10]}`;
  } else if (n > 0) {
    result += ONES[n];
  }
  return result;
}

export function numberToIndianWords(amount: number): string {
  const rounded = Math.round(Math.abs(amount || 0));
  if (rounded === 0) return 'Zero Rupees Only';

  const crore = Math.floor(rounded / 10000000);
  const lakh = Math.floor((rounded % 10000000) / 100000);
  const thousand = Math.floor((rounded % 100000) / 1000);
  const hundred = rounded % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred > 0) parts.push(threeDigitsToWords(hundred));

  const words = parts.join(' ').trim();
  return `Rupees ${words} Only`;
}
