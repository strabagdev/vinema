export function normalizeAssociationText(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stemSpanishToken(token: string) {
  let value = token;

  const conservativeSuffixes = [
    "ificaciones",
    "ificacion",
    "aciones",
    "acion",
    "ificados",
    "ificadas",
    "ificado",
    "ificada",
    "amientos",
    "amiento",
    "imientos",
    "imiento",
    "adoras",
    "adores",
    "adora",
    "ador",
    "arnos",
    "ernos",
    "irnos",
    "arme",
    "erme",
    "irme",
    "mente",
  ];

  for (const suffix of conservativeSuffixes) {
    if (value.length > suffix.length + 3 && value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }

  if (value.length > 8 && value.endsWith("iones")) {
    value = `${value.slice(0, -5)}ion`;
  } else if (value.length > 7 && value.endsWith("es")) {
    value = value.slice(0, -2);
  } else if (value.length > 6 && value.endsWith("s")) {
    value = value.slice(0, -1);
  }

  if (value.length > 7 && value.endsWith("ado")) {
    value = value.slice(0, -3);
  } else if (value.length > 7 && value.endsWith("ada")) {
    value = value.slice(0, -3);
  } else if (value.length > 7 && value.endsWith("ar")) {
    value = value.slice(0, -2);
  }

  return value;
}
