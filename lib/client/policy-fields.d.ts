/**
 * The keys of the two policy objects as controls: which kind each is, its unit, its range and its default, and how a
 * typed text becomes a value. Pure, and built on `../policy-keys.ts` (the one place the ranges and defaults live).
 * @module dsh-browser/client/policy-fields
 */
export type PolicyFieldName = 'usagePolicy' | 'automationAssets';
export type PolicyKind = 'int' | 'float' | 'bool' | 'enum' | 'text';
export interface PolicyKeySpec {
    key: string;
    kind: PolicyKind;
    unit?: 'ms' | 'days' | 'tokens' | 'count' | 'ratio';
    /** The sub-heading it is listed under (`automationAssets` only). */
    section?: 'candidates' | 'library' | 'activation';
    options?: readonly string[];
}
export declare const POLICY_SPECS: Record<PolicyFieldName, readonly PolicyKeySpec[]>;
/** The default of a key; undefined when it has none (the assets directory). */
export declare function defaultOf(field: PolicyFieldName, key: string): unknown;
/** The inclusive range of a numeric key. */
export declare function boundsOf(field: PolicyFieldName, key: string): readonly [number, number] | undefined;
/** A value as the text a control shows. */
export declare function valueText(value: unknown): string;
export type ParsedPolicyValue = {
    ok: true;
    value: string | number | boolean | undefined;
} | {
    ok: false;
    problem: 'invalidNumber' | 'invalidChoice' | 'invalidRange';
};
/** What a typed text means for one key; an empty text means "the default" (no value). */
export declare function parsePolicyText(field: PolicyFieldName, spec: PolicyKeySpec, text: string): ParsedPolicyValue;
