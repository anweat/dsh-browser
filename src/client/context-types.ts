import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Registers `ctx.configForms` on the client Context, plus the settings slot map.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Declares the Plugins page's `plugins.item` slot this card registers into; the
// slot map is owned by the plugin-manager package, so its types must be in scope.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'dsh-browser.card': keyof typeof zh }
}

export type Context = ClientContext
