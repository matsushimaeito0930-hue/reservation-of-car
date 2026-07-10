import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const storePath = path.join(dataDir, "store.json");
const distDir = path.join(__dirname, "dist");
const port = Number(process.env.PORT || 8787);

const defaultStore = {
  settings: {
    carName: "Rapan",
    members: [
      { id: "member-1", name: "弟", color: "#0f766e" },
      { id: "member-2", name: "兄", color: "#c2410c" }
    ]
  },
  reservations: []
};

const memberColors = ["#0f766e", "#c2410c", "#2563eb", "#7c3aed", "#ca8a04", "#be123c", "#475569", "#0891b2"];

const app = express();
app.use(express.json({ limit: "64kb" }));

async function readStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      settings: sanitizeSettings(parsed.settings),
      reservations: Array.isArray(parsed.reservations)
        ? parsed.reservations.map(sanitizeStoredReservation).filter(Boolean)
        : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Could not read data store. Starting with defaults.", error);
    }

    await writeStore(defaultStore);
    return structuredClone(defaultStore);
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${storePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, storePath);
}

function sanitizeSettings(settings = {}) {
  const fallback = structuredClone(defaultStore.settings);
  const carName = cleanText(settings.carName, 28) || fallback.carName;
  const incomingMembers = Array.isArray(settings.members) ? settings.members : [];
  const seenIds = new Set();

  const members = incomingMembers
    .map((member, index) => {
      const incomingId = cleanText(member?.id, 64);
      const id = incomingId && !seenIds.has(incomingId) ? incomingId : `member-${crypto.randomUUID()}`;
      const name = cleanText(member?.name, 20);

      if (!name) return null;

      seenIds.add(id);
      return {
        id,
        name,
        color: isHexColor(member?.color) ? member.color : memberColors[index % memberColors.length]
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  return { carName, members: members.length > 0 ? members : fallback.members };
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function sanitizeStoredReservation(value) {
  try {
    return normalizeReservation(value, value.id || crypto.randomUUID());
  } catch {
    return null;
  }
}

function normalizeReservation(body, existingId = crypto.randomUUID()) {
  const reservation = {
    id: existingId,
    memberId: cleanText(body.memberId, 32),
    title: cleanText(body.title, 40),
    startDate: cleanText(body.startDate, 10),
    endDate: cleanText(body.endDate, 10),
    allDay: body.allDay !== false,
    startTime: cleanText(body.startTime, 5),
    endTime: cleanText(body.endTime, 5),
    notes: cleanText(body.notes, 160),
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  validateReservation(reservation);

  if (reservation.allDay) {
    reservation.startTime = "";
    reservation.endTime = "";
  }

  return reservation;
}

function validateReservation(reservation) {
  const { startDate, endDate, allDay, startTime, endTime, memberId } = reservation;

  if (!memberId) {
    throw httpError(400, "予約する人を選んでください。");
  }

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw httpError(400, "日付を確認してください。");
  }

  if (dateIndex(endDate) < dateIndex(startDate)) {
    throw httpError(400, "終了日は開始日以降にしてください。");
  }

  if (!allDay) {
    if (!isTime(startTime) || !isTime(endTime)) {
      throw httpError(400, "時間を確認してください。");
    }

    const span = reservationInterval(reservation);
    if (span.end <= span.start) {
      throw httpError(400, "終了時刻は開始時刻より後にしてください。");
    }
  }
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

function dateIndex(value) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function timeMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function reservationInterval(reservation) {
  const startDay = dateIndex(reservation.startDate);
  const endDay = dateIndex(reservation.endDate);

  if (reservation.allDay) {
    return {
      start: startDay * 1440,
      end: (endDay + 1) * 1440
    };
  }

  return {
    start: startDay * 1440 + timeMinutes(reservation.startTime),
    end: endDay * 1440 + timeMinutes(reservation.endTime)
  };
}

function reservationsOverlap(first, second) {
  const a = reservationInterval(first);
  const b = reservationInterval(second);
  return a.start < b.end && b.start < a.end;
}

function findConflicts(candidate, reservations, skipId) {
  return reservations.filter((reservation) => reservation.id !== skipId && reservationsOverlap(candidate, reservation));
}

function requestActorId(request) {
  return cleanText(request.get("x-actor-id"), 64);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

app.get("/api/state", async (_request, response, next) => {
  try {
    response.json(await readStore());
  } catch (error) {
    next(error);
  }
});

app.post("/api/reservations", async (request, response, next) => {
  try {
    const store = await readStore();
    const reservation = normalizeReservation(request.body);
    const actorId = requestActorId(request);
    const memberExists = store.settings.members.some((member) => member.id === reservation.memberId);

    if (!memberExists) {
      throw httpError(400, "予約する人を選んでください。");
    }

    if (!actorId || actorId !== reservation.memberId) {
      throw httpError(403, "自分の名前で予約してください。");
    }

    const conflicts = findConflicts(reservation, store.reservations);
    if (conflicts.length > 0) {
      response.status(409).json({ message: "その時間帯はすでに予約されています。", conflicts });
      return;
    }

    store.reservations.push(reservation);
    await writeStore(store);
    response.status(201).json(reservation);
  } catch (error) {
    next(error);
  }
});

app.put("/api/reservations/:id", async (request, response, next) => {
  try {
    const store = await readStore();
    const index = store.reservations.findIndex((reservation) => reservation.id === request.params.id);
    const actorId = requestActorId(request);

    if (index === -1) {
      throw httpError(404, "予約が見つかりません。");
    }

    if (!actorId || actorId !== store.reservations[index].memberId) {
      throw httpError(403, "ほかの人の予約は編集できません。");
    }

    const reservation = normalizeReservation(
      {
        ...request.body,
        createdAt: store.reservations[index].createdAt
      },
      request.params.id
    );

    if (reservation.memberId !== actorId) {
      throw httpError(403, "予約の名前は変更できません。");
    }

    const conflicts = findConflicts(reservation, store.reservations, request.params.id);
    if (conflicts.length > 0) {
      response.status(409).json({ message: "その時間帯はすでに予約されています。", conflicts });
      return;
    }

    store.reservations[index] = reservation;
    await writeStore(store);
    response.json(reservation);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/reservations/:id", async (request, response, next) => {
  try {
    const store = await readStore();
    const target = store.reservations.find((reservation) => reservation.id === request.params.id);
    const actorId = requestActorId(request);

    if (!target) {
      throw httpError(404, "予約が見つかりません。");
    }

    if (!actorId || actorId !== target.memberId) {
      throw httpError(403, "ほかの人の予約は取り消せません。");
    }

    const nextReservations = store.reservations.filter((reservation) => reservation.id !== request.params.id);

    store.reservations = nextReservations;
    await writeStore(store);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", async (request, response, next) => {
  try {
    const store = await readStore();
    store.settings = sanitizeSettings(request.body);
    await writeStore(store);
    response.json(store.settings);
  } catch (error) {
    next(error);
  }
});

try {
  await fs.access(distDir);
  app.use(express.static(distDir));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(distDir, "index.html"));
  });
} catch {
  app.get("/", (_request, response) => {
    response.type("text/plain").send("Run npm run dev and open the Vite URL.");
  });
}

app.use((error, _request, response, _next) => {
  const status = error.status || 500;
  response.status(status).json({
    message: status === 500 ? "サーバーでエラーが発生しました。" : error.message
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Reservation API listening on http://localhost:${port}`);
});
