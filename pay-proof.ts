import { boostUsd, pkrForUsd } from "./money.ts";

/** 11-digit Pakistan mobile wallet: 03 then 9 digits. */
export const PK_WALLET = /^03[0-9]{9}$/;

export const BOOST_OFF_COPY = "Founder payment account not attached. Payments disabled.";

export const ERR_NAME = "Please enter correct account name";
export const ERR_NUMBER = "Invalid account number. Please enter correct 11 digit number";
export const ERR_NUMBER_REQUIRED = "Account number is required";
export const ERR_MISSING = "This account number does not exist";
export const ERR_LOW = "Insufficient balance in your account";
export const ERR_TID = "Please enter a valid Transaction ID";

export function founderAccountAttached(value: string | null | undefined) {
  return Boolean(String(value ?? "").trim());
}

export function holderError(name: string) {
  const next = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!next) return "";
  if (next.length < 3 || !/[A-Za-z\u0600-\u06FF]/.test(next)) return ERR_NAME;
  return "";
}

export function digitsOnly(raw: string) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 11);
}

/** Fake, empty, or repeated wallets. Real mixed numbers pass. */
export function senderNumberError(raw: string) {
  const digits = digitsOnly(raw);
  if (!digits) return ERR_NUMBER_REQUIRED;
  if (!PK_WALLET.test(digits)) return ERR_NUMBER;
  const repeated = /^(\d)\1{10}$/.test(digits);
  const longRun = /(\d)\1{6,}/.test(digits);
  const paired = /^(\d\d)\1{4}/.test(digits);
  if (digits === "00000000000" || repeated || longRun || paired) return ERR_MISSING;
  return "";
}

/**
 * Stand-in until a live wallet API is connected.
 * Ordinary numbers clear every boost tier.
 * A valid number ending in 0000 is treated as an empty wallet.
 */
export function simulatedBalancePkr(raw: string) {
  const digits = digitsOnly(raw);
  if (senderNumberError(digits)) return 0;
  if (digits.endsWith("0000")) return 0;
  return 9_999_999;
}

export function balanceError(raw: string, pkr: number) {
  if (senderNumberError(raw)) return "";
  if (simulatedBalancePkr(raw) < pkr) return ERR_LOW;
  return "";
}

export function tidError(raw: string) {
  const tid = String(raw ?? "").replace(/\s+/g, "").trim();
  if (!/^[A-Za-z0-9]{8,15}$/.test(tid)) return ERR_TID;
  if (/^(.)\1+$/.test(tid)) return ERR_TID;
  return "";
}

export const ERR_PIN = "Invalid PIN. Please enter correct 5-digit PIN";
export const ERR_PIN_WRONG = "Incorrect PIN. Please try again";
export const ERR_CARD = "Invalid card number";
export const ERR_CARD_EXP = "Card expiry must be a future date";
export const ERR_CVV = "Invalid CVV";
export const ERR_CARD_LOW = "Card declined for funds";

const CHECKOUT_METHODS = new Set(["easypaisa", "jazzcash", "card"]);

/** Checkout method. Visa and MasterCard map to card. SadaPay is not a method. */
export function normalizePayMethod(raw: string | undefined) {
  const value = String(raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (value === "visa" || value === "mastercard" || value === "master") return "card";
  return CHECKOUT_METHODS.has(value) ? value : "easypaisa";
}

export function orderRef() {
  return `FLR-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function boostAmounts(kind: string) {
  const usd = boostUsd(kind === "week" || kind === "month" ? kind : "day");
  return { usd, pkr: pkrForUsd(usd) };
}

/** Test PIN only. 00000 is wrong. 11111 is an empty test wallet. Never stored. */
export function pinError(pin: string, pkr: number) {
  const value = String(pin ?? "").replace(/\D/g, "");
  if (!/^\d{5}$/.test(value)) return ERR_PIN;
  if (value === "00000") return ERR_PIN_WRONG;
  if (value === "11111") return `Insufficient balance in your account. You need ${pkr.toLocaleString("en-US")} PKR`;
  return "";
}

export function luhnOk(num: string) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i -= 1) {
    let digit = num.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return false;
    if (alt) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alt = !alt;
  }
  return num.length > 0 && sum % 10 === 0;
}

/** Checks the card on this device. The full number and CVV are not saved. */
export function cardError(input: { number: string; expiry: string; cvv: string; name: string }) {
  const number = String(input.number ?? "").replace(/\D/g, "");
  if (number.length !== 16 || !luhnOk(number)) return ERR_CARD;
  if (number === "4000000000000002") return ERR_CARD_LOW;
  const match = /^(\d{2})\/(\d{2})$/.exec(String(input.expiry ?? "").replace(/\s/g, ""));
  if (!match) return ERR_CARD_EXP;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return ERR_CARD_EXP;
  if (new Date(year, month, 1).getTime() <= Date.now()) return ERR_CARD_EXP;
  if (!/^\d{3}$/.test(String(input.cvv ?? ""))) return ERR_CVV;
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || !/[A-Za-z]/.test(name)) return ERR_NAME;
  return "";
}

/** First digits stay visible. The rest of a wallet number or email stays hidden. */
export function maskReceiving(raw: string) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.includes("@")) {
    const [name, host] = value.split("@");
    const keep = name.slice(0, 2);
    return `${keep}${"•".repeat(Math.max(3, name.length - keep.length))}@${host}`;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 6) return `${digits.slice(0, 4)}${"x".repeat(digits.length - 4)}`;
  if (value.length <= 4) return "xxxx";
  return `${value.slice(0, 2)}${"x".repeat(value.length - 2)}`;
}

export function routeHint(method: string, account: string) {
  const mask = maskReceiving(account);
  if (method === "easypaisa") return mask ? `Routed to Founder Easypaisa ${mask}` : "Routed to Founder Easypaisa";
  if (method === "jazzcash") return mask ? `Routed to Founder JazzCash ${mask}` : "Routed to Founder JazzCash";
  if (method === "bank") return mask ? `Routed to Founder Bank ${mask}` : "Routed to Founder Bank";
  if (method === "card") return mask ? `Routed to Founder Payoneer/Wise ${mask}` : "Routed to Founder Payoneer/Wise";
  return "";
}

export function assertDirectPay(input: { payer: string; method?: string; pin?: string; last4?: string; pkr: number; founderAccount?: string | null; openMethods?: readonly string[] | null }) {
  if (!founderAccountAttached(input.founderAccount)) throw new Error("BOOST_OFF");
  const payer = String(input.payer ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (holderError(payer)) throw new Error("BOOST_NAME");
  const method = normalizePayMethod(input.method);
  if (input.openMethods && !input.openMethods.includes(method)) throw new Error("BOOST_OFF");
  if (!Number.isFinite(input.pkr) || input.pkr < 1) throw new Error("BOOST_LOW");
  if (method === "card") {
    const last4 = String(input.last4 ?? "").replace(/\D/g, "").slice(0, 4);
    if (!/^\d{4}$/.test(last4) || last4 === "0000") throw new Error("CARD_BAD");
    if (last4 === "0002") throw new Error("CARD_LOW");
    return { payer, method, sender: "", tid: "", shot: "", last4 };
  }
  const pin = String(input.pin ?? "").replace(/\D/g, "").slice(0, 5);
  const problem = pinError(pin, input.pkr);
  if (problem === ERR_PIN) throw new Error("PIN_BAD");
  if (problem === ERR_PIN_WRONG) throw new Error("PIN_WRONG");
  if (problem) throw new Error("PIN_LOW");
  return { payer, method, sender: "", tid: "", shot: "", last4: "" };
}

export function assertPayProof(input: { payer: string; sender?: string; method?: string; pin?: string; last4?: string; pkr: number; founderAccount?: string | null; openMethods?: readonly string[] | null }) {
  const proof = assertDirectPay(input);
  return { ...proof, sender: digitsOnly(input.sender ?? "") };
}

/** Server gate. Amount comes from the plan, never from the buyer. */
export function assertBoostProof(input: { payer: string; method?: string; pin?: string; last4?: string; kind: string; founderAccount?: string | null; openMethods?: readonly string[] | null }) {
  const kind = input.kind === "week" || input.kind === "month" ? input.kind : "day";
  const { usd, pkr } = boostAmounts(kind);
  const proof = assertDirectPay({ ...input, pkr });
  return { kind, usd, pkr, ...proof, amount: `${pkr} PKR` };
}
