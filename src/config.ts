import "dotenv/config";
import { RhidConfig } from "./types.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): RhidConfig {
  return {
    baseUrl: process.env.RHID_BASE_URL?.replace(/\/$/, "") || "https://www.rhid.com.br",
    email: requiredEnv("RHID_EMAIL"),
    password: requiredEnv("RHID_PASSWORD"),
    headless: (process.env.HEADLESS || "false").toLowerCase() === "true"
  };
}
