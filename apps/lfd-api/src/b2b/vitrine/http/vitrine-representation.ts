import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import { VITRINE_XML_ROOTS, type VitrineXmlRoot } from "./xml/vitrine-xml-shapes.js";
import { writeXml } from "./xml/xml-writer.js";
import { writeXsd } from "./xml/xsd-writer.js";

/**
 * `?format=json|xml` (Hugo, 2026-10-18). Absent, l'en-tête `Accept` décide ;
 * présent, il l'emporte sur l'en-tête — un lien collé dans un navigateur dit
 * ce qu'il veut sans pouvoir toucher aux en-têtes.
 */
export const formatQuerySchema = z
  .enum(["json", "xml"], "format inconnu : « format » accepte json, xml")
  .optional();

export type VitrineFormat = z.infer<typeof formatQuerySchema>;

export const XML_CONTENT_TYPE = "application/xml; charset=utf-8";

/** Le XSD des trois lectures, calculé une fois : il ne dépend que du code. */
export const VITRINE_XSD = writeXsd(VITRINE_XML_ROOTS);

function wantsXml(format: VitrineFormat, accept: string | undefined): boolean {
  if (format !== undefined) {
    return format === "xml";
  }
  return (accept ?? "")
    .split(",")
    .some((range) => range.split(";")[0]?.trim().toLowerCase() === "application/xml");
}

/**
 * La MÊME ressource, en JSON ou en XML : la vue passe telle quelle, ou par le
 * sérialiseur que le XSD décrit. `Vary: Accept` parce que la représentation
 * dépend de l'en-tête — un cache intermédiaire ne doit pas servir l'une pour
 * l'autre.
 */
export function vitrineRepresentation<T>(
  view: T,
  root: VitrineXmlRoot,
  negotiation: { readonly format: VitrineFormat; readonly accept: string | undefined },
  response: Response,
): T | StreamableFile {
  response.setHeader("Vary", "Accept");
  if (!wantsXml(negotiation.format, negotiation.accept)) {
    return view;
  }
  return xmlFile(writeXml(root, VITRINE_XML_ROOTS[root], view), response);
}

export function xmlFile(xml: string, response: Response): StreamableFile {
  response.setHeader("Content-Type", XML_CONTENT_TYPE);
  return new StreamableFile(Buffer.from(xml, "utf8"));
}
