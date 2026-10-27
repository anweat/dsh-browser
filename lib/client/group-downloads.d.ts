/**
 * "Downloads": where files land and how large one may be. The size is stored in bytes; the control shows the largest
 * unit that divides it exactly, so 104857600 reads as "100 MiB".
 * @module dsh-browser/client/group-downloads
 */
import { type Card } from './field-rows.tsx';
export declare const DOWNLOAD_FIELDS: readonly ["downloadDir", "downloadMaxBytes"];
export declare function DownloadsGroup({ card }: {
    card: Card;
}): import("react").JSX.Element;
