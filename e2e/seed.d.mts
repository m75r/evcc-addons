// Typen für e2e/seed.mjs (Playwright-Konfiguration und Helfer importieren es)
export declare const root: string;
export declare function buildFixtures(): void;
export declare function seedZips(): string[];
export declare const SEED_RELEASE_TAG: string;
/** Release des Fake-Katalogs unter /releases/latest; `null` ergibt 404 */
export declare function writeRelease(tag: string | null): void;
