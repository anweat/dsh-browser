import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { zh } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'dsh-browser.card': keyof typeof zh;
    }
}
export type Context = ClientContext;
