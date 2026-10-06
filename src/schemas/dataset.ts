/**
 * Zod schemas for the **dataset**. Deliberately separate from `types/data.ts`:
 * the validation runs in the web worker (large files), so zod does not end up
 * in the main bundle of the UI.
 *
 * All messages are German - they appear unchanged in the error box of the
 * app (and in the output of `npm run data:validate`).
 */
import { z } from 'zod'

export const positionSchema = z.object(
  {
    longitude: z.number({ error: 'muss eine Zahl zwischen -180 und 180 sein' }).min(-180).max(180),
    latitude: z.number({ error: 'muss eine Zahl zwischen -90 und 90 sein' }).min(-90).max(90),
  },
  { error: 'muss ein Objekt mit longitude und latitude sein' },
)

export const itemSchema = z.object(
  {
    position: positionSchema,
    address: z.string({ error: 'muss eine Textzeile sein (Adresse)' }),
    image: z.string({ error: 'muss eine Textzeile sein (Bild-Link oder leerer String)' }),
    name: z.string({ error: 'muss eine Textzeile sein (Name)' }),
    description: z.string({ error: 'muss eine Textzeile sein (Beschreibung)' }),
    /** Optional: older datasets have no features. */
    features: z
      .array(z.string({ error: 'muss eine Textzeile sein (Merkmal)' }).max(40))
      .max(12)
      .optional(),
  },
  { error: 'muss ein Objekt mit position, address, image, name und description sein' },
)

export const itemsSchema = z.array(itemSchema, {
  error: 'muss eine Liste von Einträgen sein, z. B. [{ "position": …, "name": … }]',
})

/** Shorthand for the complete dataset. */
export const datasetSchema = itemsSchema

/**
 * Formats zod errors compactly as a list with locations - for the error box in
 * the app and for the output of `npm run data:validate`.
 */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(Wurzel)'
    return `${path}: ${issue.message}`
  })
}
