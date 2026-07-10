import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  ListChecks,
  Lock,
  Plus,
  Save,
  Settings,
  Trash2,
  UserRound,
  X
} from "lucide-react";

const defaultSettings = {
  carName: "Rapan",
  members: [
    { id: "member-1", name: "弟", color: "#0f766e" },
    { id: "member-2", name: "兄", color: "#c2410c" }
  ]
};

const memberColors = ["#0f766e", "#c2410c", "#2563eb", "#7c3aed", "#ca8a04", "#be123c", "#475569", "#0891b2"];
const startHourOptions = Array.from({ length: 17 }, (_, index) => index + 6);
const endHourOptions = Array.from({ length: 17 }, (_, index) => index + 7);

const viewItems = [
  { id: "calendar", label: "予定", icon: CalendarDays },
  { id: "reserve", label: "予約", icon: Plus },
  { id: "list", label: "一覧", icon: ListChecks },
  { id: "settings", label: "設定", icon: Settings }
];

const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
const fullDayNames = ["日", "月", "火", "水", "木", "金", "土"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function hourLabel(hour) {
  return `${hour}:00`;
}

function hourValue(hour) {
  return `${pad(hour)}:00`;
}

function createMember(name, index) {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  return {
    id: `member-${id}`,
    name: name.trim().slice(0, 20),
    color: memberColors[index % memberColors.length]
  };
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayValue() {
  return toDateInputValue(new Date());
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthTitle(date) {
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "long" });
}

function dateLabel(value) {
  const date = parseDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}(${fullDayNames[date.getDay()]})`;
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

function overlaps(first, second) {
  const a = reservationInterval(first);
  const b = reservationInterval(second);
  return a.start < b.end && b.start < a.end;
}

function reservationsOnDate(reservations, value) {
  return reservations.filter((reservation) => reservation.startDate <= value && value <= reservation.endDate);
}

function createForm(date = todayValue(), memberId = defaultSettings.members[0].id) {
  return {
    memberId,
    title: "",
    startDate: date,
    endDate: date,
    allDay: true,
    startTime: "09:00",
    endTime: "18:00",
    notes: ""
  };
}

function formatReservationRange(reservation) {
  const range =
    reservation.startDate === reservation.endDate
      ? dateLabel(reservation.startDate)
      : `${dateLabel(reservation.startDate)} - ${dateLabel(reservation.endDate)}`;

  if (reservation.allDay) {
    return `${range} 終日`;
  }

  return `${range} ${reservation.startTime}-${reservation.endTime}`;
}

function isValidCandidate(candidate) {
  if (!candidate.memberId || !candidate.startDate || !candidate.endDate) return false;
  if (candidate.endDate < candidate.startDate) return false;

  if (!candidate.allDay) {
    if (!candidate.startTime || !candidate.endTime) return false;
    try {
      const interval = reservationInterval(candidate);
      return interval.end > interval.start;
    } catch {
      return false;
    }
  }

  return true;
}

function sortReservations(first, second) {
  return reservationInterval(first).start - reservationInterval(second).start;
}

export default function App() {
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState(defaultSettings);
  const [reservations, setReservations] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayValue());
  const [activeView, setActiveView] = useState("calendar");
  const [form, setForm] = useState(createForm());
  const [currentUserId, setCurrentUserId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [timeStage, setTimeStage] = useState("start");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const memberById = useMemo(() => {
    return new Map(settings.members.map((member) => [member.id, member]));
  }, [settings.members]);

  const currentUser = useMemo(() => {
    return settings.members.find((member) => member.id === currentUserId) || settings.members[0] || defaultSettings.members[0];
  }, [currentUserId, settings.members]);

  const memberHasReservations = useMemo(() => {
    return new Set(reservations.map((reservation) => reservation.memberId));
  }, [reservations]);

  const orderedReservations = useMemo(() => {
    return [...reservations].sort(sortReservations);
  }, [reservations]);

  const selectedReservations = useMemo(() => {
    return reservationsOnDate(orderedReservations, selectedDate);
  }, [orderedReservations, selectedDate]);

  const upcomingReservations = useMemo(() => {
    const today = todayValue();
    return orderedReservations.filter((reservation) => reservation.endDate >= today).slice(0, 8);
  }, [orderedReservations]);

  const calendarReservations = useMemo(() => {
    return orderedReservations.filter((reservation) => reservation.endDate >= todayValue()).slice(0, 12);
  }, [orderedReservations]);

  const candidate = useMemo(() => ({ ...form, id: editingId || "draft" }), [editingId, form]);
  const selectedStartHour = form.startTime ? Number(form.startTime.slice(0, 2)) : null;
  const selectedEndHour = form.endTime ? Number(form.endTime.slice(0, 2)) : null;

  const liveConflicts = useMemo(() => {
    if (!isValidCandidate(candidate)) return [];
    return reservations.filter((reservation) => reservation.id !== editingId && overlaps(candidate, reservation));
  }, [candidate, editingId, reservations]);

  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(currentMonth);
    const gridStart = addDays(firstDay, -firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(gridStart, index);
      const value = toDateInputValue(date);
      return {
        date,
        value,
        inMonth: date.getMonth() === currentMonth.getMonth(),
        reservations: reservationsOnDate(orderedReservations, value)
      };
    });
  }, [currentMonth, orderedReservations]);

  const currentUse = useMemo(() => {
    const now = todayValue();
    return orderedReservations.find((reservation) => reservation.startDate <= now && now <= reservation.endDate);
  }, [orderedReservations]);

  const nextUse = useMemo(() => {
    const now = todayValue();
    return orderedReservations.find((reservation) => reservation.startDate > now);
  }, [orderedReservations]);

  useEffect(() => {
    async function loadState() {
      try {
        const response = await fetch("/api/state");
        if (!response.ok) throw new Error("load failed");
        const state = await response.json();
        const nextSettings = state.settings || defaultSettings;
        const savedUserId = window.localStorage.getItem("rapan-current-user-id");
        const nextUserId = nextSettings.members.some((member) => member.id === savedUserId)
          ? savedUserId
          : nextSettings.members[0]?.id || defaultSettings.members[0].id;

        setSettings(nextSettings);
        setSettingsDraft(nextSettings);
        setCurrentUserId(nextUserId);
        setReservations(state.reservations || []);
        setForm(createForm(todayValue(), nextUserId));
      } catch {
        setNotice({ type: "error", message: "データを読み込めませんでした。" });
      } finally {
        setLoading(false);
      }
    }

    loadState();
  }, []);

  function updateForm(patch) {
    setNotice(null);
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.startDate && (!current.endDate || current.endDate < patch.startDate)) {
        next.endDate = patch.startDate;
      }
      return next;
    });
  }

  function canManageReservation(reservation) {
    return reservation.memberId === currentUser?.id;
  }

  function selectCurrentUser(id) {
    const member = settings.members.find((candidate) => candidate.id === id);
    if (!member) return;

    setCurrentUserId(member.id);
    window.localStorage.setItem("rapan-current-user-id", member.id);
    setForm((current) => ({ ...current, memberId: member.id }));
    setNotice(null);
  }

  function selectDay(value) {
    setSelectedDate(value);
    updateForm({ startDate: value, endDate: value });

    if (window.matchMedia("(max-width: 859px)").matches) {
      setActiveView("reserve");
    }
  }

  function resetForm(date = selectedDate) {
    setEditingId("");
    setTimeStage("start");
    setForm(createForm(date, currentUser?.id || settings.members[0]?.id || defaultSettings.members[0].id));
  }

  function setAllDayReservation() {
    setTimeStage("start");
    updateForm({ allDay: true, startTime: "", endTime: "" });
  }

  function startTimedReservation() {
    setTimeStage("start");
    updateForm({ allDay: false, startTime: "", endTime: "" });
  }

  function chooseStartHour(hour) {
    updateForm({ allDay: false, startTime: hourValue(hour), endTime: "" });
    setTimeStage("end");
  }

  function chooseEndHour(hour) {
    if (selectedStartHour === null || hour <= selectedStartHour) return;
    updateForm({ allDay: false, endTime: hourValue(hour) });
    setTimeStage("done");
  }

  function resetTimeSelection() {
    updateForm({ allDay: false, startTime: "", endTime: "" });
    setTimeStage("start");
  }

  async function submitReservation(event) {
    event.preventDefault();
    setNotice(null);

    if (!isValidCandidate(candidate)) {
      setNotice({ type: "error", message: "日付と時間を確認してください。" });
      return;
    }

    if (liveConflicts.length > 0) {
      setNotice({ type: "error", message: "重なっている予約があります。" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/reservations/${editingId}` : "/api/reservations", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-Actor-Id": currentUser?.id || form.memberId },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setNotice({ type: "error", message: body.message || "予約できませんでした。" });
        return;
      }

      const saved = await response.json();
      setReservations((current) => {
        if (editingId) {
          return current.map((reservation) => (reservation.id === saved.id ? saved : reservation));
        }
        return [...current, saved];
      });
      setSelectedDate(saved.startDate);
      resetForm(saved.startDate);
      setNotice({ type: "success", message: editingId ? "予約を更新しました。" : "予約しました。" });
      setActiveView("calendar");
    } finally {
      setSaving(false);
    }
  }

  function editReservation(reservation) {
    if (!canManageReservation(reservation)) {
      setNotice({ type: "error", message: "ほかの人の予約は編集できません。" });
      return;
    }

    setEditingId(reservation.id);
    setForm({
      memberId: reservation.memberId,
      title: reservation.title || "",
      startDate: reservation.startDate,
      endDate: reservation.endDate,
      allDay: reservation.allDay,
      startTime: reservation.startTime || "09:00",
      endTime: reservation.endTime || "18:00",
      notes: reservation.notes || ""
    });
    setTimeStage(reservation.allDay ? "start" : "done");
    setSelectedDate(reservation.startDate);
    setCurrentMonth(startOfMonth(parseDate(reservation.startDate)));
    setNotice(null);
    setActiveView("reserve");
  }

  async function deleteReservation(id) {
    const target = reservations.find((reservation) => reservation.id === id);
    if (!target) return;
    if (!canManageReservation(target)) {
      setNotice({ type: "error", message: "ほかの人の予約は取り消せません。" });
      return;
    }

    const member = memberById.get(target.memberId)?.name || "予約";

    if (!window.confirm(`${member}の予約を取り消しますか？`)) return;

    const response = await fetch(`/api/reservations/${id}`, {
      method: "DELETE",
      headers: { "X-Actor-Id": currentUser?.id || "" }
    });
    if (response.ok) {
      setReservations((current) => current.filter((reservation) => reservation.id !== id));
      if (editingId === id) resetForm();
      setNotice({ type: "success", message: "予約を取り消しました。" });
    } else {
      setNotice({ type: "error", message: "取り消しできませんでした。" });
    }
  }

  function addDraftMember() {
    const name = newMemberName.trim();

    if (!name) {
      setNotice({ type: "error", message: "追加する名前を入力してください。" });
      return;
    }

    if (settingsDraft.members.length >= 12) {
      setNotice({ type: "error", message: "登録できる名前は12人までです。" });
      return;
    }

    setSettingsDraft((current) => ({
      ...current,
      members: [...current.members, createMember(name, current.members.length)]
    }));
    setNewMemberName("");
    setNotice(null);
  }

  function updateDraftMember(id, name) {
    setSettingsDraft((current) => ({
      ...current,
      members: current.members.map((member) => (member.id === id ? { ...member, name } : member))
    }));
  }

  function removeDraftMember(id) {
    if (settingsDraft.members.length <= 1) {
      setNotice({ type: "error", message: "名前は1人以上登録してください。" });
      return;
    }

    if (memberHasReservations.has(id)) {
      setNotice({ type: "error", message: "予約がある名前は削除できません。" });
      return;
    }

    setSettingsDraft((current) => ({
      ...current,
      members: current.members.filter((member) => member.id !== id)
    }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const cleanMembers = settingsDraft.members
        .map((member) => ({ ...member, name: member.name.trim() }))
        .filter((member) => member.name);

      if (cleanMembers.length === 0) {
        setNotice({ type: "error", message: "名前は1人以上登録してください。" });
        return;
      }

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settingsDraft, members: cleanMembers })
      });

      if (!response.ok) throw new Error("settings failed");
      const saved = await response.json();
      const nextUserId = saved.members.some((member) => member.id === currentUserId)
        ? currentUserId
        : saved.members[0]?.id || defaultSettings.members[0].id;

      setSettings(saved);
      setSettingsDraft(saved);
      setCurrentUserId(nextUserId);
      window.localStorage.setItem("rapan-current-user-id", nextUserId);
      setForm((current) => ({
        ...current,
        memberId: saved.members.some((member) => member.id === current.memberId) ? current.memberId : nextUserId
      }));
      setNotice({ type: "success", message: "設定を保存しました。" });
    } catch {
      setNotice({ type: "error", message: "設定を保存できませんでした。" });
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = isValidCandidate(candidate) && liveConflicts.length === 0 && !saving;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-area">
          <div className="brand-mark" aria-hidden="true">
            <Car size={26} />
          </div>
          <div>
            <p className="eyebrow">共有車カレンダー</p>
            <h1>{settings.carName}予約</h1>
          </div>
        </div>

        <div className="vehicle-strip">
          <img src="/rapan-driveway.png" alt={`${settings.carName}のイメージ`} className="vehicle-image" />
          <div className="vehicle-copy">
            <span className="status-label">{currentUse ? "使用中" : "空き"}</span>
            <strong>{currentUse ? memberById.get(currentUse.memberId)?.name || "予約あり" : "今日は空いています"}</strong>
            <span>{nextUse ? `次回 ${dateLabel(nextUse.startDate)}` : "次の予約はありません"}</span>
          </div>
        </div>
      </header>

      <section className="current-user-panel" aria-label="この端末の利用者">
        <span>この端末の利用者</span>
        <div className="current-user-buttons">
          {settings.members.map((member) => (
            <button
              key={member.id}
              type="button"
              className={currentUser?.id === member.id ? "is-active" : ""}
              onClick={() => selectCurrentUser(member.id)}
              style={{ "--member-color": member.color }}
            >
              <UserRound size={16} />
              <span>{member.name}</span>
            </button>
          ))}
        </div>
      </section>

      {notice ? (
        <div className={`notice ${notice.type}`} role="status">
          {notice.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{notice.message}</span>
        </div>
      ) : null}

      <main className="app-main" aria-busy={loading}>
        <section className={`panel calendar-panel view-panel ${activeView === "calendar" ? "is-active" : ""}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">今月の予定</p>
              <h2>{monthTitle(currentMonth)}</h2>
            </div>
            <div className="icon-group">
              <button
                className="icon-button"
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                aria-label="前の月"
                title="前の月"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => setCurrentMonth(startOfMonth(new Date()))}
                aria-label="今月"
                title="今月"
              >
                <CalendarDays size={20} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                aria-label="次の月"
                title="次の月"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="week-row">
            {dayNames.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((day) => {
              const isToday = day.value === todayValue();
              const isSelected = day.value === selectedDate;
              const isSunday = day.date.getDay() === 0;
              const isSaturday = day.date.getDay() === 6;

              return (
                <button
                  key={day.value}
                  type="button"
                  className={[
                    "day-cell",
                    day.inMonth ? "" : "is-outside",
                    isToday ? "is-today" : "",
                    isSelected ? "is-selected" : "",
                    day.reservations.length > 0 ? "has-booking" : "",
                    isSunday ? "is-sunday" : "",
                    isSaturday ? "is-saturday" : ""
                  ].join(" ")}
                  onClick={() => selectDay(day.value)}
                >
                  <span className="day-number">{day.date.getDate()}</span>
                  <span className="day-bookings">
                    {day.reservations.slice(0, 2).map((reservation) => {
                      const member = memberById.get(reservation.memberId);
                      return (
                        <span
                          key={reservation.id}
                          className="booking-dot"
                          style={{ "--member-color": member?.color || "#475569" }}
                        >
                          {member?.name || "予約"}
                        </span>
                      );
                    })}
                    {day.reservations.length > 2 ? <span className="more-dot">+{day.reservations.length - 2}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="selected-strip">
            <div>
              <p className="eyebrow">選択日</p>
              <strong>{dateLabel(selectedDate)}</strong>
            </div>
            <div className="selected-actions">
              <div className="selected-list">
                {selectedReservations.length === 0 ? (
                  <span className="empty-inline">この日は空いています</span>
                ) : (
                  selectedReservations.map((reservation) => {
                    const canManage = canManageReservation(reservation);

                    return (
                      <button
                        key={reservation.id}
                        type="button"
                        className={`mini-booking ${canManage ? "" : "is-locked"}`}
                        onClick={() => (canManage ? editReservation(reservation) : null)}
                        disabled={!canManage}
                      >
                        <span
                          className="mini-color"
                          style={{ "--member-color": memberById.get(reservation.memberId)?.color || "#475569" }}
                        />
                        <span>{memberById.get(reservation.memberId)?.name || "予約"}</span>
                        {!canManage ? <Lock size={14} /> : null}
                      </button>
                    );
                  })
                )}
              </div>
              <button className="quick-reserve-button" type="button" onClick={() => setActiveView("reserve")}>
                <Plus size={16} />
                <span>この日に予約</span>
              </button>
            </div>
          </div>

          <div className="calendar-reservation-board">
            <div className="board-heading">
              <div>
                <p className="eyebrow">登録済み</p>
                <h3>これからの予定</h3>
              </div>
              <span>{calendarReservations.length}件</span>
            </div>

            {calendarReservations.length === 0 ? (
              <div className="empty-state compact">
                <CalendarDays size={22} />
                <strong>登録済みの予定はありません</strong>
              </div>
            ) : (
              <div className="calendar-reservation-list">
                {calendarReservations.map((reservation) => {
                  const member = memberById.get(reservation.memberId);
                  const canManage = canManageReservation(reservation);

                  return (
                    <article
                      key={reservation.id}
                      className="calendar-reservation-row"
                      style={{ "--member-color": member?.color || "#475569" }}
                    >
                      <div className="booking-main">
                        <span className="member-pill">
                          <span className="pill-dot" />
                          {member?.name || "予約"}
                        </span>
                        <h3>{reservation.title || "車を使う"}</h3>
                        <p>
                          <Clock3 size={15} />
                          {formatReservationRange(reservation)}
                        </p>
                        {reservation.notes ? <p className="note-text">{reservation.notes}</p> : null}
                      </div>
                      {canManage ? (
                        <div className="card-actions">
                          <button className="icon-button" type="button" onClick={() => editReservation(reservation)} aria-label="編集" title="編集">
                            <Edit3 size={18} />
                          </button>
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() => deleteReservation(reservation.id)}
                            aria-label="削除"
                            title="削除"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="locked-owner" title="ほかの人の予約です">
                          <Lock size={17} />
                          <span>ほかの人</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className={`panel form-panel view-panel ${activeView === "reserve" ? "is-active" : ""}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">予約入力</p>
              <h2>{editingId ? "予約編集" : "新しい予約"}</h2>
            </div>
            {editingId ? (
              <button className="icon-button" type="button" onClick={() => resetForm()} aria-label="編集をやめる" title="編集をやめる">
                <X size={20} />
              </button>
            ) : null}
          </div>

          <form className="reservation-form" onSubmit={submitReservation}>
            <fieldset className="member-field">
              <legend>使う人</legend>
              <div className="member-switch">
                {settings.members.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={form.memberId === member.id ? "is-picked" : ""}
                    onClick={() => selectCurrentUser(member.id)}
                    style={{ "--member-color": member.color }}
                  >
                    <UserRound size={17} />
                    <span>{member.name}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="field">
              <span>予定名</span>
              <input
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                placeholder="帰省、買い物、送迎など"
                maxLength={40}
              />
            </label>

            <div className="date-grid">
              <label className="field">
                <span>開始</span>
                <input type="date" value={form.startDate} onChange={(event) => updateForm({ startDate: event.target.value })} />
              </label>
              <label className="field">
                <span>終了</span>
                <input type="date" value={form.endDate} onChange={(event) => updateForm({ endDate: event.target.value })} />
              </label>
            </div>

            <div className="time-section">
              <span className="field-label">時間</span>
              <div className="time-mode">
                <button type="button" className={form.allDay ? "is-active" : ""} onClick={setAllDayReservation}>
                  終日
                </button>
                <button type="button" className={!form.allDay ? "is-active" : ""} onClick={startTimedReservation}>
                  時間指定
                </button>
              </div>

              {!form.allDay ? (
                <div className="time-picker">
                  {timeStage === "done" && form.startTime && form.endTime ? (
                    <div className="time-summary">
                      <strong>
                        {form.startTime} - {form.endTime}
                      </strong>
                      <button type="button" onClick={resetTimeSelection}>
                        選び直す
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="time-hint">
                        {timeStage === "end" && selectedStartHour !== null
                          ? `${hourLabel(selectedStartHour)}から使います。返す時間を選んでください。`
                          : "使い始める時間を選んでください。"}
                      </p>
                      <div className="hour-list">
                        {(timeStage === "end" ? endHourOptions : startHourOptions).map((hour) => {
                          const isDisabled = timeStage === "end" && selectedStartHour !== null && hour <= selectedStartHour;
                          const isPickedStart = selectedStartHour === hour;
                          const isPickedEnd = selectedEndHour === hour;

                          return (
                            <button
                              key={hour}
                              type="button"
                              className={isPickedStart || isPickedEnd ? "is-picked" : ""}
                              disabled={isDisabled}
                              onClick={() => (timeStage === "end" ? chooseEndHour(hour) : chooseStartHour(hour))}
                            >
                              {timeStage === "end" ? hourLabel(hour) : `${hourLabel(hour)}〜`}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <label className="field">
              <span>メモ</span>
              <textarea
                value={form.notes}
                onChange={(event) => updateForm({ notes: event.target.value })}
                placeholder="鍵、駐車場所、帰宅時間など"
                maxLength={160}
              />
            </label>

            {liveConflicts.length > 0 ? (
              <div className="conflict-box">
                <AlertCircle size={18} />
                <div>
                  <strong>重複あり</strong>
                  <span>{liveConflicts.map((reservation) => memberById.get(reservation.memberId)?.name || "予約").join("、")}</span>
                </div>
              </div>
            ) : null}

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={!canSubmit}>
                <Save size={18} />
                <span>{saving ? "保存中" : editingId ? "更新" : "予約"}</span>
              </button>
              <button className="ghost-button" type="button" onClick={() => resetForm()}>
                <X size={18} />
                <span>リセット</span>
              </button>
            </div>
          </form>
        </section>

        <section className={`panel list-panel view-panel ${activeView === "list" ? "is-active" : ""}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">次の予約</p>
              <h2>これからの予約</h2>
            </div>
            <button className="icon-button accent" type="button" onClick={() => setActiveView("reserve")} aria-label="予約を追加" title="予約を追加">
              <Plus size={20} />
            </button>
          </div>

          <div className="booking-list">
            {upcomingReservations.length === 0 ? (
              <div className="empty-state">
                <CalendarDays size={24} />
                <strong>予約はまだありません</strong>
              </div>
            ) : (
              upcomingReservations.map((reservation) => {
                const member = memberById.get(reservation.memberId);
                const canManage = canManageReservation(reservation);

                return (
                  <article key={reservation.id} className="booking-card" style={{ "--member-color": member?.color || "#475569" }}>
                    <div className="booking-main">
                      <span className="member-pill">
                        <span className="pill-dot" />
                        {member?.name || "予約"}
                      </span>
                      <h3>{reservation.title || "車を使う"}</h3>
                      <p>
                        <Clock3 size={15} />
                        {formatReservationRange(reservation)}
                      </p>
                      {reservation.notes ? <p className="note-text">{reservation.notes}</p> : null}
                    </div>
                    {canManage ? (
                      <div className="card-actions">
                        <button className="icon-button" type="button" onClick={() => editReservation(reservation)} aria-label="編集" title="編集">
                          <Edit3 size={18} />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => deleteReservation(reservation.id)}
                          aria-label="削除"
                          title="削除"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="locked-owner" title="ほかの人の予約です">
                        <Lock size={17} />
                        <span>ほかの人</span>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className={`panel settings-panel view-panel ${activeView === "settings" ? "is-active" : ""}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">表示名</p>
              <h2>設定</h2>
            </div>
          </div>

          <form className="settings-form" onSubmit={saveSettings}>
            <label className="field">
              <span>車名</span>
              <input
                value={settingsDraft.carName}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, carName: event.target.value }))}
                maxLength={28}
              />
            </label>

            <div className="settings-members">
              <span className="field-label">登録した名前</span>
              {settingsDraft.members.map((member) => (
                <div className="member-editor" key={member.id}>
                  <span className="member-color" style={{ "--member-color": member.color }} />
                  <input value={member.name} onChange={(event) => updateDraftMember(member.id, event.target.value)} maxLength={20} />
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => removeDraftMember(member.id)}
                    disabled={settingsDraft.members.length <= 1 || memberHasReservations.has(member.id)}
                    aria-label="名前を削除"
                    title={memberHasReservations.has(member.id) ? "予約がある名前は削除できません" : "名前を削除"}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>

            <div className="add-member-row">
              <input
                value={newMemberName}
                onChange={(event) => setNewMemberName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addDraftMember();
                  }
                }}
                placeholder="名前を追加"
                maxLength={20}
              />
              <button type="button" className="ghost-button" onClick={addDraftMember}>
                <Plus size={18} />
                <span>追加</span>
              </button>
            </div>

            <button className="primary-button" type="submit" disabled={saving}>
              <Save size={18} />
              <span>保存</span>
            </button>
          </form>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="画面切り替え">
        {viewItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? "is-active" : ""}
              onClick={() => setActiveView(item.id)}
              aria-label={item.label}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
