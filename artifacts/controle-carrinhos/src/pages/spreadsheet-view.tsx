import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  Info,
  List,
  Table2,
  Eye,
  Laptop,
  RotateCcw,
  GripVertical,
  Lightbulb,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Button, PageHeader, StatusPill, todayISO } from "@/components/app-ui";
import {
  type Cart,
  type CartMovement,
  type CampusSettings,
  type Reservation,
  type ReserveResponsiblePerson,
  type ReserveResponsiblePersonType,
  type ReserveUnitAssignment,
  type Segment,
  type TeacherProfile,
  defaultCampusSettings,
  getCartScheduleForDate,
  isSameDayReservationAllowed,
  reservationSameDayWindowLabel,
  useCampusData,
} from "@/lib/campus-data";
import { segmentAbbreviation, type ClassRoomEntry, useRoomDirectory } from "@/lib/room-directory";
import { type TeacherAccessAccount, loadTeacherAccounts } from "@/lib/teacher-accounts";
import { getAuthenticatedSession } from "@/lib/auth-session";
import {
  deleteSharedReservation,
  loadSharedReservations,
  requestSharedReservationsRefresh,
  moveSharedReservationsToCart,
  saveSharedReservation,
} from "@/lib/reservations-api";
import {
  allReservationsTab,
  completeViewColumns,
  defaultCompleteViewColumns,
  filterReservationsByCart,
  filterReservationsByPeriod,
  getVisibleCompleteViewColumns,
  getCompleteViewCartNames,
  getFloorOptimizationSuggestions,
  formatDateKey,
  getCartScheduleRows,
  getMondayOfWeek,
  getWeekDates,
  prepareQuickAccessCartMove,
  prepareQuickAccessMove,
  type CompleteViewColumnKey,
} from "@/lib/spreadsheet-view";
import { nextBookableWeekday } from "@/lib/cart-availability";
import { loadTeacherProfile } from "@/lib/teacher-profile";
import { loadTeacherSpreadsheetReservations } from "@/lib/teacher-spreadsheet";

type SpreadsheetMode = "quick" | "complete" | "reserve";
type PeriodFilter = "Todos" | "Manhã" | "Tarde";
type TeacherBookingSlot = {
  key: string;
  date: string;
  cart: string;
  start: string;
  end: string;
  period: "Manhã" | "Tarde";
  room: string;
};
const teacherClassKey = (entry: Pick<ClassRoomEntry, "segment" | "className">) =>
  `${entry.segment}::${entry.className}`;
const teacherProfileSegments = (profile: TeacherAccessAccount) =>
  [...new Set([profile.segment, ...(profile.additionalSegments ?? [])])];
const teacherProfileDefaultClass = (profile: TeacherAccessAccount) =>
  profile.segment === "Contraturno"
    ? "Contraturno"
    : profile.segment === "Educação Infantil" || profile.segment === "Fundamental 1"
      ? profile.className.trim()
      : "";
const roomsForTeacherProfileClass = (
  profile: TeacherAccessAccount,
  className: string,
  period: "Manhã" | "Tarde",
  classOptions: ClassRoomEntry[],
) => {
  const normalizedClassName = normalizeSuggestionText(className);
  if (!normalizedClassName) return [];
  const segments = teacherProfileSegments(profile);
  const profileClass = teacherProfileDefaultClass(profile);
  const primaryProfileClass =
    (profile.segment === "Educação Infantil" || profile.segment === "Fundamental 1") &&
    profileClass &&
    normalizedClassName === normalizeSuggestionText(profileClass);
  return [...new Set(classOptions
    .filter((entry) =>
      entry.period === period &&
      normalizeSuggestionText(entry.className) === normalizedClassName &&
      segments.includes(entry.segment) &&
      (!primaryProfileClass || entry.segment === profile.segment),
    )
    .map((entry) => entry.room))];
};

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const completeColumnsStorageKey = "controle-carrinhos-complete-view-columns";
const completeCartStorageKey = "controle-carrinhos-complete-view-cart";
const spreadsheetModeStorageKey = "controle-carrinhos-view-mode";

const normalizeSuggestionText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "o")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");

function ResponsibleNameCombobox({
  label,
  value,
  suggestions,
  onChange,
  onSelect,
  placeholder,
  className,
  testId,
  required = false,
  disabled = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  placeholder?: string;
  className: string;
  testId?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const listId = `responsible-suggestions-${useId()}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = normalizeSuggestionText(value);
  const queryWords = query.split(" ").filter(Boolean);
  const filteredSuggestions = queryWords.length === 0
    ? []
    : suggestions.filter((name) => {
        const normalizedName = normalizeSuggestionText(name);
        const nameWords = normalizedName.split(" ");
        const initials = nameWords.map((word) => word[0] ?? "").join("");
        return (
          queryWords.every((queryWord) =>
            nameWords.some((word) => word.startsWith(queryWord)),
          ) ||
          (queryWords.length === 1 && initials.startsWith(query.replace(/\s/g, "")))
        );
      }).slice(0, 8);
  const suggestionsVisible = isOpen && filteredSuggestions.length > 0;
  const selectSuggestion = (name: string) => {
    onSelect(name);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  useLayoutEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <div className="relative min-w-0">
      <input
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={suggestionsVisible}
        aria-controls={listId}
        aria-activedescendant={
          suggestionsVisible && activeIndex >= 0
            ? `${listId}-option-${activeIndex}`
            : undefined
        }
        maxLength={120}
        ref={inputRef}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onKeyDown={(event) => {
          if (!suggestionsVisible) {
            if (event.key === "ArrowDown" && filteredSuggestions.length > 0) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex(0);
            }
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % filteredSuggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) =>
              current <= 0 ? filteredSuggestions.length - 1 : current - 1,
            );
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            selectSuggestion(filteredSuggestions[activeIndex]);
          } else if (event.key === "Escape") {
            setIsOpen(false);
            setActiveIndex(-1);
          }
        }}
        className={className}
        data-testid={testId}
      />
      {suggestionsVisible && (
        <div
          id={listId}
          role="listbox"
          aria-label={`Sugestões para ${label}`}
          className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[#c0ccda] bg-white py-1 shadow-lg"
        >
          {filteredSuggestions.map((name, index) => (
            <div
              key={name}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectSuggestion(name)}
              className={`cursor-pointer px-3 py-2 text-sm text-[#173252] ${
                activeIndex === index ? "bg-[#e8eff7]" : "hover:bg-[#f5f8fb]"
              }`}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatWeekLabel(dates: Date[]) {
  if (dates.length === 0) return "";
  return `${dateFormatter.format(dates[0])} – ${dateFormatter.format(dates.at(-1)!)}`;
}

function sortCartNames(names: string[]) {
  return [...new Set(names)].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true }),
  );
}

function readSpreadsheetMode(readOnly: boolean): SpreadsheetMode {
  if (readOnly) return "quick";
  try {
    const savedMode = window.localStorage.getItem(spreadsheetModeStorageKey);
    return savedMode === "complete" || savedMode === "reserve" || savedMode === "quick"
      ? savedMode
      : "quick";
  } catch {
    return "quick";
  }
}

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("button, input, select, textarea, a, [contenteditable='true']"));

function QuickBookingForm({
  cartName,
  start,
  period,
  editing,
  teacher,
  className,
  room,
  saving,
  error,
  classOptions,
  roomOptions,
  teacherSuggestions,
  teacherSuggestionsError,
  onTeacherChange,
  onTeacherSelect,
  onClassChange,
  onRoomChange,
  onSubmit,
  onCancel,
}: {
  cartName: string;
  start: string;
  period: "Manhã" | "Tarde";
  editing: boolean;
  teacher: string;
  className: string;
  room: string;
  saving: boolean;
  error: string;
  classOptions: ClassRoomEntry[];
  roomOptions: string[];
  teacherSuggestions: string[];
  teacherSuggestionsError: string;
  onTeacherChange: (value: string) => void;
  onTeacherSelect: (value: string) => void;
  onClassChange: (value: string) => void;
  onRoomChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const suffix = `${cartName}-${start}`;
  const selectedSegments = [...new Set(classOptions
    .filter((entry) =>
      entry.period === period &&
      normalizeSuggestionText(entry.className) === normalizeSuggestionText(className),
    )
    .map((entry) => entry.segment))];
  return (
    <form
      className="space-y-1"
      data-testid={`quick-book-form-${cartName}-${start}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ResponsibleNameCombobox
        label="Nome do professor"
        placeholder="Nome do professor"
        value={teacher}
        suggestions={teacherSuggestions}
        onChange={onTeacherChange}
        onSelect={onTeacherSelect}
        className="w-full min-w-0 rounded border border-[#9baec4] bg-white px-1.5 py-1 text-[10px] text-[#172d49] outline-none focus:border-[#345779]"
        testId="quick-book-teacher"
        required
        disabled={saving}
        autoFocus
      />
      {teacherSuggestionsError && (
        <p role="alert" className="text-[10px] text-red-700">
          Não foi possível carregar as sugestões de professores: {teacherSuggestionsError}. A reserva manual continua disponível.
        </p>
      )}
      <input required maxLength={80} aria-label="Ano ou série" placeholder="Ano / série" list={`quick-class-options-${suffix}`} value={className} disabled={saving} onChange={(event) => onClassChange(event.target.value)} className="w-full min-w-0 rounded border border-[#9baec4] bg-white px-1.5 py-1 text-[10px] text-[#172d49] outline-none focus:border-[#345779]" />
      {selectedSegments.length > 0 && <div className="flex items-center gap-1" data-testid="quick-book-segment"><span className="text-[9px] text-slate-500">Etapa:</span>{selectedSegments.map((segment) => <span key={segment} title={segment} aria-label={`Etapa ${segment}`} className="rounded bg-[#eaf1f8] px-1.5 py-0.5 text-[9px] font-bold text-[#345779]">{segmentAbbreviation(segment)}</span>)}</div>}
      <datalist id={`quick-class-options-${suffix}`}>
        {[...new Set(classOptions.filter((entry) => entry.period === period).map((entry) => entry.className))].map((option) => <option key={option} value={option} />)}
      </datalist>
      <input required maxLength={80} aria-label="Sala" placeholder="Sala" list={`quick-room-options-${suffix}`} value={room} disabled={saving} onChange={(event) => onRoomChange(event.target.value)} className="w-full min-w-0 rounded border border-[#9baec4] bg-white px-1.5 py-1 text-[10px] text-[#172d49] outline-none focus:border-[#345779]" />
      <datalist id={`quick-room-options-${suffix}`}>
        {roomOptions.map((option) => <option key={option} value={option} />)}
      </datalist>
      {error && <p role="alert" className="text-[10px] text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-1">
        <button type="submit" disabled={saving} className="rounded bg-[#345779] px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50">
          {saving ? "Salvando..." : editing ? "Salvar edição" : "Reservar"}
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className="rounded px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function QuickAccess({
  dates,
  focusRequest,
  cartNames,
  reservations,
  cartSchedules,
  unavailableCartNames,
  allowCartATransitionScheduling,
  onMoveReservation,
  onMoveReservations,
  onUndoReservations,
  periodFilter,
  readOnly,
  canDirectBook,
  canTeacherBook,
  currentTeacherName,
  teacherProfiles,
  teacherProfilesError,
  teacherSegments,
  teacherProfileClassName,
  campusSettings,
  onCreateReservation,
  onUpdateReservation,
  onDeleteReservation,
  classOptions,
  roomOptions,
  roomCatalogLoading,
  roomsSyncError,
}: {
  dates: Date[];
  focusRequest: { date: string; id: number } | null;
  cartNames: string[];
  reservations: Reservation[];
  cartSchedules: ReturnType<typeof useCampusData>["cartSchedules"];
  unavailableCartNames: string[];
  allowCartATransitionScheduling: boolean;
  onMoveReservation: (reservation: Reservation) => Promise<void>;
  onMoveReservations: (reservations: Reservation[]) => Promise<void>;
  onUndoReservations: (reservations: Reservation[]) => Promise<void>;
  periodFilter: PeriodFilter;
  readOnly: boolean;
  canDirectBook: boolean;
  canTeacherBook: boolean;
  currentTeacherName: string;
  teacherProfiles: TeacherAccessAccount[];
  teacherProfilesError: string;
  teacherSegments: Segment[];
  teacherProfileClassName: string;
  campusSettings: CampusSettings;
  onCreateReservation: (reservation: Omit<Reservation, "id" | "status">) => Promise<void>;
  onUpdateReservation: (reservation: Omit<Reservation, "id" | "status">, id: number) => Promise<void>;
  onDeleteReservation: (reservation: Reservation) => Promise<void>;
  classOptions: ClassRoomEntry[];
  roomOptions: string[];
  roomCatalogLoading: boolean;
  roomsSyncError: string;
}) {
  const [selectedReservationIds, setSelectedReservationIds] = useState<number[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [cartDropTarget, setCartDropTarget] = useState<string | null>(null);
  const [movingReservationIds, setMovingReservationIds] = useState<number[]>([]);
  const [moveError, setMoveError] = useState("");
  const [moveMessage, setMoveMessage] = useState("");
  const [undoStack, setUndoStack] = useState<Reservation[][]>([]);
  const [undoing, setUndoing] = useState(false);
  const [bookingTarget, setBookingTarget] = useState<string | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [bookingTeacher, setBookingTeacher] = useState("");
  const [bookingTeacherProfileId, setBookingTeacherProfileId] = useState<string | null>(null);
  const [bookingClass, setBookingClass] = useState("");
  const [bookingRoom, setBookingRoom] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);
  const [teacherBookingSlots, setTeacherBookingSlots] = useState<TeacherBookingSlot[]>([]);
  const [teacherBookingClass, setTeacherBookingClass] = useState("");
  const [teacherBookingError, setTeacherBookingError] = useState("");
  const [teacherBookingMessage, setTeacherBookingMessage] = useState("");
  const [teacherBookingSaving, setTeacherBookingSaving] = useState(false);
  const selectedBookingTeacherProfile = teacherProfiles.find(
    (profile) => profile.id === bookingTeacherProfileId,
  );
  const bookingProfileSegments = selectedBookingTeacherProfile
    ? teacherProfileSegments(selectedBookingTeacherProfile)
    : [];
  const bookingClassOptions = (period: "Manhã" | "Tarde") => {
    if (!selectedBookingTeacherProfile) return classOptions;
    const profileClass = teacherProfileDefaultClass(selectedBookingTeacherProfile);
    return classOptions.filter((entry) =>
      entry.period === period &&
      bookingProfileSegments.includes(entry.segment) &&
      (
        !profileClass ||
        entry.segment !== selectedBookingTeacherProfile.segment ||
        normalizeSuggestionText(entry.className) === normalizeSuggestionText(profileClass)
      ),
    );
  };
  const bookingRoomOptions = (period: "Manhã" | "Tarde") => {
    if (!selectedBookingTeacherProfile) return roomOptions;
    const roomsForClass = roomsForTeacherProfileClass(
      selectedBookingTeacherProfile,
      bookingClass,
      period,
      classOptions,
    );
    if (roomsForClass.length > 0) return roomsForClass;
    return [...new Set(classOptions
      .filter((entry) =>
        entry.period === period &&
        bookingProfileSegments.includes(entry.segment),
      )
      .map((entry) => entry.room))];
  };
  const changeBookingClass = (value: string, period: "Manhã" | "Tarde") => {
    const normalizedClassName = normalizeSuggestionText(value);
    const matchingEntries = bookingClassOptions(period).filter(
      (entry) => normalizeSuggestionText(entry.className) === normalizedClassName,
    );
    const matchingRooms = [...new Map(
      matchingEntries.map((entry) => [normalizeSuggestionText(entry.room), entry.room]),
    ).values()];
    const currentRoomMatches = matchingRooms.some(
      (room) => normalizeSuggestionText(room) === normalizeSuggestionText(bookingRoom),
    );
    setBookingClass(value);
    setBookingRoom(
      matchingRooms.length === 1
        ? matchingRooms[0]
        : currentRoomMatches
          ? bookingRoom
          : "",
    );
    setBookingError("");
  };
  const changeBookingRoom = (value: string, period: "Manhã" | "Tarde") => {
    const normalizedRoom = normalizeSuggestionText(value);
    const matchingEntries = bookingClassOptions(period).filter(
      (entry) => normalizeSuggestionText(entry.room) === normalizedRoom,
    );
    const matchingClasses = [...new Map(
      matchingEntries.map((entry) => [
        normalizeSuggestionText(entry.className),
        entry.className,
      ]),
    ).values()];
    const currentClassMatches = matchingClasses.some(
      (className) => normalizeSuggestionText(className) === normalizeSuggestionText(bookingClass),
    );
    setBookingRoom(value);
    if (matchingClasses.length === 1) {
      setBookingClass(matchingClasses[0]);
    } else if (matchingClasses.length > 1 && !currentClassMatches) {
      setBookingClass("");
    }
    setBookingError("");
  };
  const selectBookingTeacher = (name: string, period: "Manhã" | "Tarde") => {
    const profile = teacherProfiles.find(
      (entry) => normalizeSuggestionText(entry.name) === normalizeSuggestionText(name),
    );
    setBookingTeacher(name);
    setBookingTeacherProfileId(profile?.id ?? null);
    setBookingError("");
    if (!profile) {
      setBookingClass("");
      setBookingRoom("");
      return;
    }
    const defaultClass = teacherProfileDefaultClass(profile);
    setBookingClass(defaultClass);
    const rooms = roomsForTeacherProfileClass(profile, defaultClass, period, classOptions);
    setBookingRoom(rooms.length === 1 ? rooms[0] : "");
  };
  const changeBookingTeacher = (name: string) => {
    if (bookingTeacherProfileId) {
      setBookingClass("");
      setBookingRoom("");
    }
    setBookingTeacherProfileId(null);
    setBookingTeacher(name);
    setBookingError("");
  };
  const teacherClassOptions = useMemo(() => {
    const selectedPeriods = [...new Set(teacherBookingSlots.map((slot) => slot.period))];
    const options = classOptions.filter((entry) => {
      if (!teacherSegments.includes(entry.segment) || entry.segment === "Contraturno") return false;
      if (
        (entry.segment === "Educação Infantil" || entry.segment === "Fundamental 1") &&
        entry.segment === teacherSegments[0]
      ) {
        if (
          !teacherProfileClassName ||
          normalizeSuggestionText(entry.className) !==
            normalizeSuggestionText(teacherProfileClassName)
        ) return false;
      }
      return selectedPeriods.every((period) =>
        classOptions.some((candidate) =>
          candidate.segment === entry.segment &&
          normalizeSuggestionText(candidate.className) ===
            normalizeSuggestionText(entry.className) &&
          candidate.period === period,
        ),
      );
    });
    return [...new Map(options.map((entry) => [
      `${entry.segment}::${normalizeSuggestionText(entry.className)}`,
      entry,
    ])).values()]
      .sort((first, second) =>
        first.segment.localeCompare(second.segment, "pt-BR") ||
        first.className.localeCompare(second.className, "pt-BR", { numeric: true }),
      );
  }, [classOptions, teacherBookingSlots, teacherProfileClassName, teacherSegments]);
  useEffect(() => {
    if (
      !teacherBookingClass ||
      teacherClassOptions.some((entry) => teacherClassKey(entry) === teacherBookingClass)
    ) return;
    setTeacherBookingClass("");
    setTeacherBookingSlots((slots) => slots.map((slot) =>
      slot.room ? { ...slot, room: "" } : slot,
    ));
    setTeacherBookingError("");
  }, [teacherBookingClass, teacherClassOptions]);
  const selectedTeacherClass = teacherClassOptions.find(
    (entry) => teacherClassKey(entry) === teacherBookingClass,
  );
  const roomsForTeacherClassAndSlot = useCallback((
    teacherClass: ClassRoomEntry | undefined,
    slot: TeacherBookingSlot,
  ) => teacherClass
    ? [...new Set(classOptions
        .filter((entry) =>
          entry.segment === teacherClass.segment &&
          normalizeSuggestionText(entry.className) ===
            normalizeSuggestionText(teacherClass.className) &&
          entry.period === slot.period &&
          teacherSegments.includes(entry.segment),
        )
        .map((entry) => entry.room))]
    : [], [classOptions, teacherSegments]);
  useEffect(() => {
    if (
      !canTeacherBook ||
      teacherBookingClass ||
      (teacherSegments[0] !== "Educação Infantil" &&
        teacherSegments[0] !== "Fundamental 1") ||
      !teacherProfileClassName
    ) {
      return;
    }
    const profileClass = teacherClassOptions.find((entry) =>
      entry.segment === teacherSegments[0] &&
      entry.className.trim().toLocaleLowerCase("pt-BR") ===
        teacherProfileClassName.trim().toLocaleLowerCase("pt-BR"),
    );
    if (profileClass) {
      setTeacherBookingClass(teacherClassKey(profileClass));
      setTeacherBookingSlots((slots) => slots.map((slot) => {
        const rooms = roomsForTeacherClassAndSlot(profileClass, slot);
        return { ...slot, room: rooms.length === 1 ? rooms[0] : "" };
      }));
    }
  }, [
    canTeacherBook,
    roomsForTeacherClassAndSlot,
    teacherBookingClass,
    teacherClassOptions,
    teacherProfileClassName,
    teacherSegments,
  ]);
  const roomOptionsForTeacherSlot = (slot: TeacherBookingSlot) =>
    roomsForTeacherClassAndSlot(selectedTeacherClass, slot);
  const setTeacherBookingClassSelection = (key: string) => {
    setTeacherBookingClass(key);
    const selected = teacherClassOptions.find((entry) => teacherClassKey(entry) === key);
    setTeacherBookingSlots((slots) => slots.map((slot) => {
      const rooms = roomsForTeacherClassAndSlot(selected, slot);
      return { ...slot, room: rooms.length === 1 ? rooms[0] : "" };
    }));
    setTeacherBookingError("");
  };
  const [deletingReservationIds, setDeletingReservationIds] = useState<number[]>([]);
  const [deleteError, setDeleteError] = useState("");
  const topWeekScrollRef = useRef<HTMLDivElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const appliedFocusRequestRef = useRef<number | null>(null);
  const pendingWeekScrollSourceRef = useRef<"top" | "bottom" | null>(null);
  const weekScrollFrameRef = useRef<number | null>(null);
  const syncWeekScroll = (source: "top" | "bottom") => {
    pendingWeekScrollSourceRef.current = source;
    if (weekScrollFrameRef.current !== null) return;
    const requestFrame = window.requestAnimationFrame?.bind(window) ??
      ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    weekScrollFrameRef.current = requestFrame(() => {
      weekScrollFrameRef.current = null;
      const pendingSource = pendingWeekScrollSourceRef.current;
      pendingWeekScrollSourceRef.current = null;
      if (!pendingSource) return;
      const sourceElement = pendingSource === "top" ? topWeekScrollRef.current : weekScrollRef.current;
      const target = pendingSource === "top" ? weekScrollRef.current : topWeekScrollRef.current;
      if (sourceElement && target && target.scrollLeft !== sourceElement.scrollLeft) {
        target.scrollLeft = sourceElement.scrollLeft;
      }
    });
  };
  useEffect(() => () => {
    if (weekScrollFrameRef.current === null) return;
    if (window.cancelAnimationFrame) {
      window.cancelAnimationFrame(weekScrollFrameRef.current);
    } else {
      window.clearTimeout(weekScrollFrameRef.current);
    }
  }, []);
  useEffect(() => {
    if (!focusRequest || appliedFocusRequestRef.current === focusRequest.id) return;
    const targetIndex = dates.findIndex(
      (date) => formatDateKey(date) === focusRequest.date,
    );
    if (targetIndex < 0) return;
    const scrollToDate = () => {
      const left = targetIndex * 760;
      if (weekScrollRef.current) weekScrollRef.current.scrollLeft = left;
      if (topWeekScrollRef.current) topWeekScrollRef.current.scrollLeft = left;
      appliedFocusRequestRef.current = focusRequest.id;
    };
    const frame = window.requestAnimationFrame?.(scrollToDate) ??
      window.setTimeout(scrollToDate, 0);
    return () => {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
    };
  }, [dates, focusRequest]);
  const createReservation = async (
    target: { date: string; cart: string; start: string; end: string; period: "Manhã" | "Tarde" },
  ) => {
    const teacherName = bookingTeacher.trim().replace(/\s+/g, " ");
    if (!teacherName) {
      setBookingError("Informe o nome do professor.");
      return;
    }
    const className = bookingClass.trim().replace(/\s+/g, " ");
    if (!className) {
      setBookingError("Informe o ano ou a série.");
      return;
    }
    const room = bookingRoom.trim().replace(/\s+/g, " ");
    if (!room) {
      setBookingError("Informe a sala.");
      return;
    }
    const matchingClassEntries = classOptions.filter((entry) =>
      entry.className.toLocaleLowerCase("pt-BR") === className.toLocaleLowerCase("pt-BR") &&
      entry.period === target.period &&
      (!selectedBookingTeacherProfile || bookingProfileSegments.includes(entry.segment)),
    );
    const classEntry = matchingClassEntries.find(
      (entry) => entry.segment === selectedBookingTeacherProfile?.segment,
    ) ?? matchingClassEntries[0];
    setBookingSaving(true);
    setBookingError("");
    try {
      const data: Omit<Reservation, "id" | "status"> = editingReservation
        ? (() => {
            const { id: _id, status: _status, ...current } = editingReservation;
            return {
              ...current,
              teacher: teacherName,
              segment: classEntry?.segment ?? editingReservation.segment,
              className,
              room,
            };
          })()
        : {
            teacher: teacherName,
            segment: classEntry?.segment ?? "Fundamental 2",
            subject: "Aula",
            className,
            room,
            period: target.period,
            date: target.date,
            start: target.start,
            end: target.end,
            cart: target.cart,
            kind: "Aula",
            quantity: 1,
          };
      if (editingReservation) {
        await onUpdateReservation(data, editingReservation.id);
      } else {
        await onCreateReservation(data);
      }
      setBookingTarget(null);
      setEditingReservation(null);
      setBookingTeacher("");
      setBookingTeacherProfileId(null);
      setBookingClass("");
      setBookingRoom("");
    } catch (error) {
      setBookingError(
        error instanceof Error ? error.message : "Não foi possível reservar este horário.",
      );
    } finally {
      setBookingSaving(false);
    }
  };
  const createTeacherReservations = async () => {
    const className = teacherBookingClass.trim().replace(/\s+/g, " ");
    if (!className) {
      setTeacherBookingError("Informe a turma ou série para os horários selecionados.");
      return;
    }
    if (!currentTeacherName.trim() || teacherBookingSlots.length === 0) {
      setTeacherBookingError("Selecione ao menos um horário livre para reservar.");
      return;
    }
    if (!selectedTeacherClass) {
      setTeacherBookingError("Selecione uma turma cadastrada no seu perfil.");
      return;
    }
    const bookings = teacherBookingSlots.map((slot) => ({
      slot,
      room: slot.room.trim(),
      allowedRooms: roomOptionsForTeacherSlot(slot),
    }));
    if (bookings.some(({ slot }) => slot.date < todayISO())) {
      setTeacherBookingError("Não é possível agendar em uma data que já passou.");
      return;
    }
    if (bookings.some(({ room, allowedRooms }) => !room || !allowedRooms.includes(room))) {
      setTeacherBookingError("Escolha, para cada horário, uma sala cadastrada pelo TI para sua turma e segmento.");
      return;
    }
    if (bookings.some(({ slot }) =>
      slot.date === todayISO() &&
      !isSameDayReservationAllowed(
        slot.date,
        slot.start,
        slot.end,
        campusSettings,
      ),
    )) {
      setTeacherBookingError(
        campusSettings.sameDayBookingEnabled
          ? `Os horários de hoje estão bloqueados. Faixas liberadas: ${reservationSameDayWindowLabel(campusSettings.sameDayBookingWindows) || "nenhuma"}.`
          : "Agendamentos para hoje estão bloqueados pelo administrador.",
      );
      return;
    }

    setTeacherBookingSaving(true);
    setTeacherBookingError("");
    setTeacherBookingMessage("");
    let completed = 0;
    try {
      for (const { slot, room } of bookings) {
        await onCreateReservation({
          teacher: currentTeacherName,
          segment: selectedTeacherClass.segment,
          subject: "Aula",
          className: selectedTeacherClass.className,
          room,
          period: slot.period,
          date: slot.date,
          start: slot.start,
          end: slot.end,
          cart: slot.cart,
          kind: "Aula",
          quantity: 1,
        });
        completed += 1;
      }
      setTeacherBookingSlots([]);
      setTeacherBookingClass("");
      setTeacherBookingMessage(
        `${completed} ${completed === 1 ? "horário reservado" : "horários reservados"} para ${currentTeacherName}.`,
      );
    } catch (error) {
      setTeacherBookingError(
        completed > 0
          ? `${completed} horário(s) foram reservados; não foi possível concluir os demais. ${error instanceof Error ? error.message : ""}`.trim()
          : error instanceof Error
            ? error.message
            : "Não foi possível reservar os horários selecionados.",
      );
      if (completed > 0) {
        setTeacherBookingSlots((slots) => slots.slice(completed));
      }
    } finally {
      setTeacherBookingSaving(false);
    }
  };
  const startEditingReservation = (reservation: Reservation) => {
    setBookingTarget(`${reservation.date}-${reservation.cart}-${reservation.period}-${reservation.start}-${reservation.end}`);
    setEditingReservation(reservation);
    setBookingTeacher(reservation.teacher);
    setBookingTeacherProfileId(null);
    setBookingClass(reservation.className);
    setBookingRoom(reservation.room);
    setBookingError("");
  };
  const deleteReservation = async (reservation: Reservation) => {
    if (deletingReservationIds.includes(reservation.id)) return;
    if (!window.confirm(`Excluir o agendamento de ${reservation.teacher} (${reservation.className})?`)) return;
    setDeletingReservationIds((ids) => [...ids, reservation.id]);
    setDeleteError("");
    try {
      await onDeleteReservation(reservation);
      setSelectedReservationIds((ids) => ids.filter((id) => id !== reservation.id));
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Não foi possível excluir o agendamento.");
    } finally {
      setDeletingReservationIds((ids) => ids.filter((id) => id !== reservation.id));
    }
  };
  const undoMove = useCallback(async () => {
    const previousReservations = undoStack.at(-1);
    if (!previousReservations || undoing) return;
    setUndoing(true);
    setMoveError("");
    try {
      await onUndoReservations(previousReservations);
      setUndoStack((stack) => stack.slice(0, -1));
      setSelectedReservationIds([]);
      setMoveMessage("Última mudança de carrinho desfeita.");
    } catch (error) {
      setMoveError(
        error instanceof Error ? error.message : "Não foi possível desfazer a mudança.",
      );
    } finally {
      setUndoing(false);
    }
  }, [onUndoReservations, undoStack, undoing]);
  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        event.defaultPrevented ||
        (event.target instanceof Element &&
          event.target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }
      if (undoStack.length === 0 || undoing) return;
      event.preventDefault();
      void undoMove();
    };
    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [undoMove]);
  const moveToSlot = async (
    event: DragEvent<HTMLDivElement>,
    target: {
      date: string;
      cart: string;
      start: string;
      end: string;
      period: "Manhã" | "Tarde";
    },
  ) => {
    event.preventDefault();
    setDropTarget(null);
    if (isInteractiveTarget(event.target)) return;
    const transferIds = event.dataTransfer.getData("text/plain")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const reservationIds = transferIds.length > 0 ? transferIds : selectedReservationIds;
    if (reservationIds.length === 0) {
      setMoveError("Selecione e arraste uma aula para um horário disponível.");
      return;
    }
    if (reservationIds.length > 1) {
      setMoveError("Para mover várias aulas sem alterar os horários, arraste a seleção até o nome do carrinho.");
      setMoveMessage("");
      return;
    }
    if (unavailableCartNames.includes(target.cart)) {
      setMoveError(`${target.cart} está indisponível e não pode receber agendamentos.`);
      return;
    }
    const result = prepareQuickAccessMove(
      reservations,
      reservationIds[0],
      target,
      allowCartATransitionScheduling,
    );
    if (!result.ok) {
      setMoveError(result.error);
      setMoveMessage("");
      return;
    }

    setMoveError("");
    setMoveMessage("");
    setMovingReservationIds(reservationIds);
    const previousReservations = reservations.filter(({ id }) => reservationIds.includes(id));
    try {
      await onMoveReservation(result.reservation);
      setUndoStack((stack) => [...stack, previousReservations]);
      setSelectedReservationIds([]);
      setMoveMessage("Agendamento movido e salvo na agenda compartilhada.");
    } catch (error) {
      setMoveError(
        error instanceof Error
          ? error.message
          : "Não foi possível mover o agendamento.",
      );
    } finally {
      setMovingReservationIds([]);
    }
  };
  const moveSelectionToCart = async (
    event: DragEvent<HTMLHeadingElement>,
    targetCart: string,
  ) => {
    event.preventDefault();
    setCartDropTarget(null);
    if (unavailableCartNames.includes(targetCart)) {
      setMoveError(`${targetCart} está indisponível e não pode receber agendamentos.`);
      setMoveMessage("");
      return;
    }
    const transferIds = event.dataTransfer.getData("text/plain")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const reservationIds = transferIds.length > 0 ? transferIds : selectedReservationIds;
    const result = prepareQuickAccessCartMove(
      reservations,
      reservationIds,
      targetCart,
      allowCartATransitionScheduling,
    );
    if (!result.ok) {
      setMoveError(result.error);
      setMoveMessage("");
      return;
    }

    setMoveError("");
    setMoveMessage("");
    setMovingReservationIds(reservationIds);
    const previousReservations = reservations.filter(({ id }) => reservationIds.includes(id));
    try {
      await onMoveReservations(result.reservations);
      setUndoStack((stack) => [...stack, previousReservations]);
      setSelectedReservationIds([]);
      setMoveMessage(
        `${result.reservations.length} ${result.reservations.length === 1 ? "aula movida" : "aulas movidas"} para ${targetCart}; os horários foram mantidos.`,
      );
    } catch (error) {
      setMoveError(
        error instanceof Error
          ? error.message
          : "Não foi possível mover as aulas selecionadas.",
      );
    } finally {
      setMovingReservationIds([]);
    }
  };

  return (
    <section aria-label="Acesso rápido em formato de planilha">
      {!readOnly && <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {selectedReservationIds.length > 0 && (
          <p className="text-xs font-semibold text-[#345779]" role="status">
            {selectedReservationIds.length} aula(s) selecionada(s)
          </p>
        )}
      </div>}
      {!readOnly && (moveError || moveMessage || deleteError) && (
        <p
          role={moveError || deleteError ? "alert" : "status"}
          className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
            moveError || deleteError
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {moveError || deleteError || moveMessage}
        </p>
      )}
      {canTeacherBook && (teacherBookingError || teacherBookingMessage) && (
        <p
          role={teacherBookingError ? "alert" : "status"}
          className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
            teacherBookingError
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {teacherBookingError || teacherBookingMessage}
        </p>
      )}
      {canTeacherBook && teacherBookingSlots.length > 0 && (
        roomsSyncError ? (
          <p
            className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
            data-testid="teacher-booking-rooms-error"
          >
            Não foi possível confirmar o cadastro de salas com o servidor. Atualize a planilha ou contate o TI. {roomsSyncError}
          </p>
        ) : null
      )}
      {canTeacherBook && teacherBookingSlots.length > 0 && (
        <section
          aria-label="Reservar horários selecionados"
          className="mb-4 overflow-hidden rounded-2xl border border-[#cbd8e6] bg-white shadow-sm"
          data-testid="teacher-booking-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf2] bg-gradient-to-r from-[#f3f7fc] to-white px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e2edf9] text-[#245b8f]">
                <CalendarDays size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#173252]">Reservar horários selecionados</h2>
                <p className="mt-1 truncate text-xs text-[#5f6f82]">
                  Professor: <strong className="font-semibold text-[#34445a]">{currentTeacherName}</strong>
                </p>
              </div>
              <span className="hidden shrink-0 rounded-full border border-[#d5e2f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#345779] sm:inline-flex">
                {teacherBookingSlots.length} {teacherBookingSlots.length === 1 ? "horário" : "horários"}
              </span>
            </div>
            <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
              <span className="rounded-full border border-[#d5e2f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#345779] sm:hidden">
                {teacherBookingSlots.length} {teacherBookingSlots.length === 1 ? "horário" : "horários"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTeacherBookingSlots([]);
                  setTeacherBookingError("");
                  setTeacherBookingMessage("");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd8e6] bg-white px-3 py-2 text-xs font-semibold text-[#34445a] transition hover:border-[#9baec4] hover:bg-[#f5f8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245b8f] focus-visible:ring-offset-2"
              >
                <X size={14} aria-hidden="true" />
                Cancelar seleção
              </button>
            </div>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            <p className="rounded-lg border border-[#d5e2f0] bg-[#f7faff] px-3 py-2 text-xs text-[#45617f]">
              {campusSettings.sameDayBookingEnabled
                ? `Agendamento no mesmo dia liberado somente entre ${reservationSameDayWindowLabel(campusSettings.sameDayBookingWindows) || "nenhum horário configurado"}.`
                : "Agendamentos no mesmo dia estão bloqueados pelo administrador."}
            </p>
            <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(260px,0.85fr)] lg:items-end">
              <label className="space-y-1.5 text-xs font-semibold text-[#34445a]">
                Turma ou série
                <select
                  value={teacherBookingClass}
                  onChange={(event) => setTeacherBookingClassSelection(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#cbd8e6] bg-white px-3 text-sm font-normal text-[#263950] shadow-sm outline-none transition focus:border-[#4b78a8] focus:ring-2 focus:ring-[#245b8f]/15 disabled:bg-[#f5f7fa]"
                  data-testid="teacher-booking-class"
                  required
                  disabled={
                    roomCatalogLoading ||
                    Boolean(roomsSyncError) ||
                    (
                      teacherClassOptions.length === 1 &&
                      (teacherSegments[0] === "Educação Infantil" ||
                        teacherSegments[0] === "Fundamental 1") &&
                      Boolean(teacherProfileClassName)
                    )
                  }
                >
                  <option value="">
                    {roomCatalogLoading
                      ? "Carregando salas cadastradas..."
                      : teacherBookingSlots.length > 0 && teacherClassOptions.length === 0
                        ? "Nenhuma turma com sala nos períodos selecionados"
                        : "Selecione sua turma"}
                  </option>
                  {teacherClassOptions.map((entry) => (
                    <option key={teacherClassKey(entry)} value={teacherClassKey(entry)}>
                      {entry.className} · {segmentAbbreviation(entry.segment)} ({entry.segment})
                    </option>
                  ))}
                </select>
                {teacherBookingSlots.length > 0 && !roomCatalogLoading && !roomsSyncError && (
                  <span className="block font-normal text-[#5f6f82]">
                    {teacherClassOptions.length > 0
                      ? "As opções têm sala vinculada em todos os períodos selecionados."
                      : "Nenhuma turma do seu perfil tem sala vinculada em todos os períodos escolhidos. Confira o cadastro de salas e os períodos."}
                  </span>
                )}
              </label>
              <div className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f5f8fb] px-3 py-2 text-xs leading-5 text-[#5f6f82]">
                <Info size={16} className="shrink-0 text-[#4c739c]" aria-hidden="true" />
                <p>
                  {teacherSegments.length > 1
                    ? `Opções limitadas ao seu perfil: ${teacherSegments.join(" e ")}.`
                    : `Opções limitadas ao seu perfil: ${teacherSegments[0] ?? "segmento cadastrado"}.`}
                </p>
              </div>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {teacherBookingSlots.map((slot, index) => {
                const allowedRooms = roomOptionsForTeacherSlot(slot);
                return (
                  <div
                    key={slot.key}
                    className="grid gap-3 rounded-xl border border-[#e1e8f0] bg-[#fbfcfe] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(200px,0.65fr)] sm:items-center sm:p-3.5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eaf1f8] text-[#345779]">
                        <CalendarDays size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#263950]">
                          {dateFormatter.format(new Date(`${slot.date}T12:00:00`))}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5f6f82]">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 size={13} aria-hidden="true" />
                            {slot.start}–{slot.end}
                          </span>
                          <span className="font-medium text-[#45617f]">{slot.cart} · {slot.period}</span>
                        </div>
                      </div>
                    </div>
                    <label className="space-y-1.5 text-xs font-semibold text-[#34445a]" htmlFor={`teacher-booking-room-${index}`}>
                      Sala cadastrada
                      <select
                        id={`teacher-booking-room-${index}`}
                        value={slot.room}
                        onChange={(event) => {
                          setTeacherBookingSlots((current) => current.map((item) =>
                            item.key === slot.key ? { ...item, room: event.target.value } : item,
                          ));
                          setTeacherBookingError("");
                        }}
                        className="h-10 w-full rounded-lg border border-[#cbd8e6] bg-white px-3 text-sm font-normal text-[#263950] outline-none transition focus:border-[#4b78a8] focus:ring-2 focus:ring-[#245b8f]/15 disabled:bg-[#f5f7fa]"
                        required
                        data-testid={`teacher-booking-room-${index}`}
                        disabled={
                          roomCatalogLoading ||
                          Boolean(roomsSyncError) ||
                          !selectedTeacherClass ||
                          allowedRooms.length === 0
                        }
                      >
                        <option value="">
                          {roomCatalogLoading
                            ? "Carregando salas cadastradas..."
                            : allowedRooms.length
                              ? "Selecione a sala"
                              : "Sem sala para esta turma e período"}
                        </option>
                        {allowedRooms.map((room) => <option key={room} value={room}>{room}</option>)}
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-[#e5ebf2] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-xs leading-5 text-[#5f6f82]">
                <Info size={15} className="mt-0.5 shrink-0 text-[#7890a8]" aria-hidden="true" />
                <span>
                  Seu nome vem do seu acesso. As salas seguem o cadastro do TI; horários já ocupados não podem ser editados por esta tela.
                </span>
              </p>
              <button
                type="button"
                disabled={
                  teacherBookingSaving ||
                  roomCatalogLoading ||
                  Boolean(roomsSyncError)
                }
                onClick={() => void createTeacherReservations()}
                className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-xl bg-[#245b8f] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#194775] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245b8f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                data-testid="teacher-booking-submit"
              >
                {teacherBookingSaving
                  ? "Salvando..."
                  : `Reservar ${teacherBookingSlots.length} ${teacherBookingSlots.length === 1 ? "horário" : "horários"}`}
              </button>
            </div>
          </div>
        </section>
      )}
      {!readOnly && undoStack.length > 0 && (
        <button
          type="button"
          disabled={undoing || movingReservationIds.length > 0}
          onClick={() => void undoMove()}
          className="mb-3 rounded-lg border border-[#9baec4] bg-white px-3 py-1.5 text-xs font-semibold text-[#263950] hover:bg-[#f0f3f6] disabled:opacity-50"
        >
          Desfazer última mudança (Ctrl+Z)
        </button>
      )}
      <div
        aria-label="Barra superior de rolagem da planilha semanal"
        className="h-4 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain"
        data-testid="quick-week-top-scroll-container"
        onScroll={() => syncWeekScroll("top")}
        ref={topWeekScrollRef}
        role="region"
        tabIndex={0}
      >
        <div
          aria-hidden="true"
          className="h-px min-w-[3804px]"
          style={{ minWidth: `${dates.length * 760 + 4}px` }}
        />
      </div>
      <div
        aria-label="Planilha semanal com rolagem horizontal"
        className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-[#a9b7c8] bg-[#eef3f8] shadow-sm"
        data-testid="quick-week-scroll-container"
        onScroll={() => syncWeekScroll("bottom")}
        ref={weekScrollRef}
        role="region"
        tabIndex={0}
      >
        <div
          className={`grid w-max gap-px bg-[#a9b7c8] ${
            dates.length === 5
              ? "min-w-[3800px] grid-cols-[repeat(5,minmax(760px,1fr))]"
              : ""
          }`}
          style={{
            minWidth: `${dates.length * 760}px`,
            gridTemplateColumns: `repeat(${dates.length}, minmax(760px, 1fr))`,
          }}
          data-testid="quick-week-grid"
        >
          {dates.map((date) => {
            const dateKey = formatDateKey(date);
            const dayReservations = reservations.filter(
              (reservation) => reservation.date === dateKey,
            );
            return (
              <article
                key={dateKey}
                className="min-w-0 bg-white"
                data-testid={`quick-day-${dateKey}`}
              >
                <header className="border-b border-[#9baec4] bg-[#dce7f3] px-3 py-2 text-center text-sm font-bold capitalize text-[#142e50]">
                  {weekdayFormatter.format(date)}
                  <span className="mt-0.5 block font-mono text-xs font-semibold">
                    {dateFormatter.format(date)}
                  </span>
                </header>
                <div
                  className="grid min-w-[740px] grid-cols-3 gap-1.5 p-2"
                  data-testid="quick-day-grid"
                >
                  {cartNames.map((cartName, cartIndex) => {
                    const schedule = cartSchedules[cartName];
                    const periods: Array<"Manhã" | "Tarde"> =
                      periodFilter === "Todos" ? ["Manhã", "Tarde"] : [periodFilter];
                    return (
                      <section
                        key={cartName}
                        className="min-w-0 overflow-hidden border border-[#9daabd] bg-white"
                      >
                        <h2
                          onDragOver={!readOnly ? (event) => {
                            if (isInteractiveTarget(event.target)) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setCartDropTarget(`${dateKey}-${cartName}`);
                          } : undefined}
                          onDragLeave={!readOnly ? (event) => {
                            if (event.currentTarget === event.target) setCartDropTarget(null);
                          } : undefined}
                          onDrop={!readOnly ? (event) => {
                            if (isInteractiveTarget(event.target)) return;
                            void moveSelectionToCart(event, cartName);
                          } : undefined}
                          title={!readOnly ? "Solte aqui para mover a seleção para este carrinho mantendo os horários" : undefined}
                          className={`border-b border-[#9daabd] px-2 py-1.5 text-center text-xs font-bold ${
                            cartIndex % 2 === 0
                              ? "bg-[#d8e7d3] text-[#244421]"
                              : "bg-[#dce5f2] text-[#1d3a5d]"
                          } ${cartDropTarget === `${dateKey}-${cartName}` ? "bg-emerald-200 outline outline-2 outline-emerald-600" : ""}`}
                        >
                          {cartName}
                        </h2>
                        {periods.map((period) => {
                          const slots = (schedule ? getCartScheduleForDate(schedule, dateKey, period) : []).map((slot) => ({
                            ...slot,
                            period,
                          }));
                          const periodReservations = filterReservationsByPeriod(dayReservations, period);
                          const rows = getCartScheduleRows(
                            cartName,
                            dateKey,
                            slots,
                            periodReservations,
                          );
                          return (
                            <div key={`${cartName}-${period}`}>
                              {periodFilter === "Todos" && (
                                <div className={`border-b border-[#b9c4d1] px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide ${period === "Manhã" ? "bg-[#edf4ea] text-[#36552f]" : "bg-[#f4efe4] text-[#765b2f]"}`}>
                                  {period}
                                </div>
                              )}
                              <div
                                className="grid grid-cols-[96px_minmax(0,1fr)] border-b border-[#b9c4d1] bg-[#f0f3f6] text-[10px] font-bold text-[#34445a]"
                                data-testid="quick-time-grid"
                              >
                                <span className="border-r border-[#b9c4d1] px-1 py-1">Horário</span>
                                <span className="px-1.5 py-1">Turma · Professor</span>
                              </div>
                              {rows.length === 0 ? (
                                <div className="grid grid-cols-[96px_minmax(0,1fr)] text-[11px] text-slate-500">
                                  <span className="border-r border-[#d5dce5] px-1 py-2">—</span>
                                  <span className="px-1.5 py-2">Sem horários</span>
                                </div>
                              ) : rows.map((row, rowIndex) => {
                            const slot = slots.find(
                              (item) => item.start === row.start && item.end === row.end,
                            );
                            const targetKey = `${dateKey}-${cartName}-${period}-${row.start}-${row.end}`;
                            const isDropTarget = dropTarget === targetKey;
                            const pastDateBlocked = Boolean(
                              canTeacherBook && slot && dateKey < todayISO(),
                            );
                            const sameDayBlocked = Boolean(
                              canTeacherBook &&
                              slot &&
                              dateKey === todayISO() &&
                              !isSameDayReservationAllowed(
                                dateKey,
                                slot.start,
                                slot.end,
                                campusSettings,
                              ),
                            );
                            return (
                              <div
                                key={`${cartName}-${dateKey}-${row.start}-${rowIndex}`}
                                onDragOver={!readOnly ? (event) => {
                                  if (!slot || isInteractiveTarget(event.target)) return;
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = "move";
                                  setDropTarget(targetKey);
                                } : undefined}
                                onDragLeave={!readOnly ? (event) => {
                                  if (event.currentTarget === event.target) setDropTarget(null);
                                } : undefined}
                                onDrop={!readOnly ? (event) => {
                                  if (!slot) return;
                                  void moveToSlot(event, {
                                    date: dateKey,
                                    cart: cartName,
                                    start: slot.start,
                                    end: slot.end,
                                    period: slot.period,
                                  });
                                } : undefined}
                                data-testid={`quick-schedule-row-${cartName}-${row.start}`}
                                className={`grid grid-cols-[96px_minmax(0,1fr)] border-b border-[#b9c4d1] text-[11px] ${
                                  slot ? "transition-colors" : ""
                                } ${
                                  isDropTarget
                                    ? "bg-[#d9ead3] outline outline-2 -outline-offset-2 outline-[#54804c]"
                                    : ""
                                }`}
                              >
                              <span className="whitespace-nowrap border-r border-[#d5dce5] bg-[#f8fafc] px-1 py-1.5 font-mono text-[10px] font-semibold text-[#263950]">
                                {row.start}–{row.end}
                              </span>
                              <div className="min-w-0 px-1.5 py-1">
                                {row.reservations.length === 0 ? (
                                  canDirectBook && slot ? (
                                    bookingTarget === targetKey ? (
                                      <QuickBookingForm
                                        cartName={cartName}
                                        start={row.start}
                                        period={period}
                                        editing={false}
                                        teacher={bookingTeacher}
                                        className={bookingClass}
                                        room={bookingRoom}
                                        saving={bookingSaving}
                                        error={bookingError}
                                        classOptions={bookingClassOptions(period)}
                                        roomOptions={bookingRoomOptions(period)}
                                        teacherSuggestions={teacherProfiles.map((profile) => profile.name)}
                                        teacherSuggestionsError={teacherProfilesError}
                                        onTeacherChange={changeBookingTeacher}
                                        onTeacherSelect={(value) => selectBookingTeacher(value, period)}
                                        onClassChange={(value) => changeBookingClass(value, period)}
                                        onRoomChange={(value) => changeBookingRoom(value, period)}
                                        onSubmit={() => void createReservation({
                                            date: dateKey,
                                            cart: cartName,
                                            start: slot.start,
                                            end: slot.end,
                                            period: slot.period,
                                          })}
                                        onCancel={() => {
                                          setBookingTarget(null);
                                          setEditingReservation(null);
                                          setBookingTeacher("");
                                          setBookingTeacherProfileId(null);
                                          setBookingClass("");
                                          setBookingRoom("");
                                          setBookingError("");
                                        }}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        aria-label={`Reservar horário ${slot.start} para ${cartName}`}
                                        onClick={() => {
                                          setBookingTarget(targetKey);
                                          setEditingReservation(null);
                                          setBookingTeacher("");
                                          setBookingTeacherProfileId(null);
                                          setBookingClass("");
                                          setBookingRoom("");
                                          setBookingError("");
                                        }}
                                        className="w-full rounded px-1 py-0.5 text-left text-slate-300 hover:bg-[#e8eff7] hover:text-[#345779]"
                                      >
                                        — <span className="sr-only">Reservar para professor</span>
                                      </button>
                                    )
                                  ) : (
                                    canTeacherBook && slot ? (
                                      <button
                                        disabled={pastDateBlocked || sameDayBlocked}
                                        type="button"
                                        aria-pressed={teacherBookingSlots.some((item) => item.key === targetKey)}
                                        aria-label={pastDateBlocked
                                          ? `Bloqueado para data passada: ${slot.start} ${slot.period}, ${cartName}`
                                          : sameDayBlocked
                                            ? `Bloqueado para agendamento no mesmo dia: ${slot.start} ${slot.period}, ${cartName}`
                                          : `${teacherBookingSlots.some((item) => item.key === targetKey) ? "Remover seleção de" : "Selecionar"} ${slot.start} ${slot.period}, ${dateFormatter.format(date)}, ${cartName}`}
                                        data-testid={`teacher-book-slot-${targetKey}`}
                                        onClick={() => {
                                          setTeacherBookingSlots((current) =>
                                            current.some((item) => item.key === targetKey)
                                              ? current.filter((item) => item.key !== targetKey)
                                              : [...current, {
                                                  key: targetKey,
                                                  date: dateKey,
                                                  cart: cartName,
                                                  start: slot.start,
                                                  end: slot.end,
                                                  period: slot.period,
                                                  room: (() => {
                                                    const rooms = selectedTeacherClass
                                                      ? [...new Set(classOptions
                                                          .filter((entry) =>
                                                            entry.segment === selectedTeacherClass.segment &&
                                                            entry.className === selectedTeacherClass.className &&
                                                            entry.period === slot.period &&
                                                            teacherSegments.includes(entry.segment),
                                                          )
                                                          .map((entry) => entry.room))]
                                                      : [];
                                                    return rooms.length === 1 ? rooms[0] : "";
                                                  })(),
                                                }],
                                          );
                                          setTeacherBookingError("");
                                          setTeacherBookingMessage("");
                                        }}
                                        className={`w-full rounded px-1 py-0.5 text-left disabled:cursor-not-allowed disabled:text-red-500 ${
                                          teacherBookingSlots.some((item) => item.key === targetKey)
                                            ? "bg-[#d9ead3] font-semibold text-[#244421] outline outline-1 outline-[#54804c]"
                                            : "text-slate-400 hover:bg-[#e8eff7] hover:text-[#345779]"
                                        }`}
                                      >
                                        {pastDateBlocked
                                          ? "Data passada"
                                          : sameDayBlocked
                                            ? "Bloqueado hoje"
                                          : teacherBookingSlots.some((item) => item.key === targetKey)
                                            ? "Selecionado"
                                            : "Livre · selecionar"}
                                      </button>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )
                                  )
                                ) : (
                                  row.reservations.map((reservation) => (
                                    bookingTarget === targetKey &&
                                    editingReservation?.id === reservation.id ? (
                                      <QuickBookingForm
                                        key={reservation.id}
                                        cartName={cartName}
                                        start={row.start}
                                        period={period}
                                        editing
                                        teacher={bookingTeacher}
                                        className={bookingClass}
                                        room={bookingRoom}
                                        saving={bookingSaving}
                                        error={bookingError}
                                        classOptions={bookingClassOptions(period)}
                                        roomOptions={bookingRoomOptions(period)}
                                        teacherSuggestions={teacherProfiles.map((profile) => profile.name)}
                                        teacherSuggestionsError={teacherProfilesError}
                                        onTeacherChange={changeBookingTeacher}
                                        onTeacherSelect={(value) => selectBookingTeacher(value, period)}
                                        onClassChange={(value) => changeBookingClass(value, period)}
                                        onRoomChange={(value) => changeBookingRoom(value, period)}
                                        onSubmit={() => void createReservation({
                                          date: dateKey,
                                          cart: cartName,
                                          start: reservation.start,
                                          end: reservation.end,
                                          period: reservation.period,
                                        })}
                                        onCancel={() => {
                                          setBookingTarget(null);
                                          setEditingReservation(null);
                                          setBookingTeacher("");
                                          setBookingTeacherProfileId(null);
                                          setBookingClass("");
                                          setBookingRoom("");
                                          setBookingError("");
                                        }}
                                      />
                                    ) : <div
                                      key={reservation.id}
                                      role={!readOnly ? "button" : undefined}
                                      tabIndex={!readOnly ? 0 : undefined}
                                      aria-pressed={!readOnly ? selectedReservationIds.includes(reservation.id) : undefined}
                                      draggable={!readOnly ? reservation.kind === "Aula" && movingReservationIds.length === 0 : undefined}
                                      title={readOnly ? undefined : reservation.kind === "Aula" ? "Clique para selecionar; segure Ctrl ao clicar para selecionar várias. Arraste para um horário ou para o nome de outro carrinho." : "Reservas de Chromebooks não podem ser movidas por esta tela"}
                                      onClick={!readOnly ? (event) => {
                                        if (isInteractiveTarget(event.target)) return;
                                        if (event.ctrlKey || event.metaKey) {
                                          event.preventDefault();
                                          setSelectedReservationIds((current) =>
                                            current.includes(reservation.id)
                                              ? current.filter((id) => id !== reservation.id)
                                              : [...current, reservation.id],
                                          );
                                        } else {
                                          setSelectedReservationIds([reservation.id]);
                                        }
                                        setMoveError("");
                                        setMoveMessage("");
                                      } : undefined}
                                      onKeyDown={!readOnly ? (event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          setSelectedReservationIds([reservation.id]);
                                        }
                                      } : undefined}
                                      onDragStart={!readOnly ? (event) => {
                                        if (
                                          reservation.kind !== "Aula" ||
                                          isInteractiveTarget(event.target)
                                        ) {
                                          event.preventDefault();
                                          return;
                                        }
                                        event.dataTransfer.effectAllowed = "move";
                                        const dragIds = selectedReservationIds.includes(reservation.id)
                                          ? selectedReservationIds
                                          : [reservation.id];
                                        event.dataTransfer.setData("text/plain", dragIds.join(","));
                                        setSelectedReservationIds(dragIds);
                                        setMoveError("");
                                        setMoveMessage("");
                                      } : undefined}
                                      onDragEnd={!readOnly ? () => setDropTarget(null) : undefined}
                                      className={`my-0.5 rounded px-1 py-0.5 leading-4 ${
                                        !readOnly && reservation.kind === "Aula"
                                          ? "cursor-grab active:cursor-grabbing"
                                          : ""
                                      } ${
                                        selectedReservationIds.includes(reservation.id)
                                          ? "bg-[#e4edf8] outline outline-1 outline-[#7893b3]"
                                          : "hover:bg-[#f2f6fa]"
                                      } ${
                                        movingReservationIds.includes(reservation.id)
                                          ? "opacity-50"
                                          : ""
                                      }`}
                                    >
                                      <div className="flex items-start gap-1">
                                        {!readOnly && reservation.kind === "Aula" && (
                                          <GripVertical
                                            size={12}
                                            aria-hidden="true"
                                            className="mt-0.5 shrink-0 text-[#718198]"
                                          />
                                        )}
                                        <div className="min-w-0">
                                          <p className="truncate font-bold text-[#172d49]">
                                            {reservation.className}
                                          </p>
                                          <p className="truncate text-slate-600">
                                            {reservation.teacher}
                                          </p>
                                          <p className="truncate text-slate-500">
                                            {reservation.room}
                                          </p>
                                        </div>
                                        {canDirectBook && (
                                          <button
                                            type="button"
                                            aria-label={`Editar agendamento de ${reservation.teacher}`}
                                            title="Editar turma, professor ou sala"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              startEditingReservation(reservation);
                                            }}
                                            className="shrink-0 rounded p-0.5 text-[#345779] hover:bg-[#e8eff7]"
                                          >
                                            <Pencil size={12} />
                                          </button>
                                        )}
                                        {canDirectBook && (
                                          <button
                                            type="button"
                                            aria-label={`Excluir agendamento de ${reservation.teacher}`}
                                            title="Excluir agendamento"
                                            disabled={deletingReservationIds.includes(reservation.id)}
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void deleteReservation(reservation);
                                            }}
                                            className="ml-auto shrink-0 rounded p-0.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                )}
                                </div>
                              </div>
                            );
                              })}
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                  {dayReservations.length === 0 && cartNames.length === 0 && (
                    <p className="p-4 text-center text-xs text-slate-500">
                      Sem reservas.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
        {readOnly
          ? "Selecione os horários livres que deseja reservar. Seu nome será preenchido automaticamente; informe a turma e a sala de cada horário. Role horizontalmente para consultar os outros dias da semana."
          : canDirectBook
            ? "Clique em um horário vazio para preencher professor, turma/série e sala. Use o lápis para editar e a lixeira para excluir um agendamento. Para reorganizar, selecione uma aula e arraste-a para outro horário; mantenha Ctrl pressionado para selecionar várias e arraste até o nome do carrinho. Role horizontalmente para consultar os outros dias da semana."
            : "Esta visão mostra carrinho, horário, turma, sala e professor. Selecione uma aula e arraste-a para outro horário. Para mover várias, mantenha Ctrl pressionado ao selecionar e arraste uma delas para o nome do carrinho de destino; os horários originais serão mantidos. A alteração só aparece como concluída depois de salva na agenda. Role horizontalmente para consultar os outros dias da semana."}
      </p>
    </section>
  );
}

function CompleteAccess({
  dates,
  reservations,
  movements,
  cartName,
  onCartChange,
  visibleColumns,
  onVisibleColumnsChange,
  periodFilter,
}: {
  dates: Date[];
  reservations: Reservation[];
  movements: ReturnType<typeof useCampusData>["movements"];
  cartName: string;
  onCartChange: (cartName: string) => void;
  visibleColumns: CompleteViewColumnKey[];
  onVisibleColumnsChange: (columns: CompleteViewColumnKey[]) => void;
  periodFilter: PeriodFilter;
}) {
  const dateKeys = new Set(dates.map(formatDateKey));
  const weekRows = reservations
    .filter((reservation) => dateKeys.has(reservation.date))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.cart.localeCompare(b.cart),
    );
  const cartNames = getCompleteViewCartNames(weekRows);
  const selectedCart =
    cartName === allReservationsTab
      ? allReservationsTab
      : cartNames.includes(cartName)
        ? cartName
        : cartNames[0] ?? "Carrinho A";
  const rows = filterReservationsByPeriod(
    filterReservationsByCart(weekRows, selectedCart),
    periodFilter,
  );
  const movementById = new Map(
    movements.map((movement) => [movement.reservationId, movement]),
  );
  const visibleColumnDefinitions = completeViewColumns.filter(({ key }) =>
    visibleColumns.includes(key),
  );
  const visibleGroups = [...new Set(visibleColumnDefinitions.map(({ group }) => group))];
  const allGroups = [...new Set(completeViewColumns.map(({ group }) => group))];
  const completedCount = rows.filter(
    (reservation) => movementById.get(reservation.id)?.status === "Concluído",
  ).length;
  const pendingCount = rows.filter((reservation) => {
    const status = movementById.get(reservation.id)?.status;
    return !status || status === "Não movido" || status === "Não atendida";
  }).length;

  const toggleColumn = (key: CompleteViewColumnKey) => {
    const nextColumns = visibleColumns.includes(key)
      ? visibleColumns.filter((column) => column !== key)
      : completeViewColumns
          .filter(({ key: columnKey }) =>
            columnKey === key || visibleColumns.includes(columnKey),
          )
          .map(({ key: columnKey }) => columnKey);
    if (nextColumns.length > 0) onVisibleColumnsChange(nextColumns);
  };
  const toggleGroup = (group: string) => {
    const groupKeys = completeViewColumns
      .filter((column) => column.group === group)
      .map(({ key }) => key);
    const groupIsVisible = groupKeys.some((key) => visibleColumns.includes(key));
    const next = groupIsVisible
      ? visibleColumns.filter((key) => !groupKeys.includes(key))
      : completeViewColumns
          .filter(({ key }) => groupKeys.includes(key) || visibleColumns.includes(key))
          .map(({ key }) => key);
    if (next.length > 0) onVisibleColumnsChange(next);
  };
  const renderCell = (
    key: CompleteViewColumnKey,
    reservation: Reservation,
    movement: CartMovement | undefined,
  ) => {
    const formatTimestamp = (timestamp?: string) =>
      timestamp ? timeFormatter.format(new Date(timestamp)) : "—";
    switch (key) {
      case "id": return <span className="font-mono font-semibold">{reservation.id}</span>;
      case "date": return dateFormatter.format(new Date(`${reservation.date}T12:00:00`));
      case "time": return <span className="font-mono">{reservation.start}–{reservation.end}</span>;
      case "cart": return <span className="font-semibold">{reservation.cart}</span>;
      case "className": return reservation.className;
      case "teacher": return reservation.teacher;
      case "room": return reservation.room;
      case "segment": return reservation.segment;
      case "subject": return reservation.subject || "—";
      case "period": return reservation.period;
      case "kind": return reservation.kind;
      case "quantity": return reservation.quantity;
      case "reservedChromebooks":
        return <span className="block max-w-64 whitespace-normal">{reservation.reservedChromebooks?.join(", ") || "—"}</span>;
      case "reservationStatus": return <StatusPill status={reservation.status} />;
      case "movementStatus": return <StatusPill status={movement?.status ?? "Não movido"} />;
      case "movedBy": return movement?.movedBy ?? "—";
      case "completedBy": return movement?.completedBy ?? movement?.confirmedBy ?? "—";
      case "requestCount":
        return movement?.requestCount
          ? <span>{movement.requestCount} vez(es){movement.requestAgainAt && <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">{formatTimestamp(movement.requestAgainAt)}</span>}</span>
          : "—";
      case "notReceived":
        return movement?.notReceived
          ? <span className="font-semibold text-[hsl(var(--destructive))]">Sim · {formatTimestamp(movement.notReceivedAt)}</span>
          : "Não";
      case "movedAt": return formatTimestamp(movement?.movedAt);
      case "completedAt": return formatTimestamp(movement?.completedAt);
      case "autoCompleted": return movement?.autoCompleted ? "Sim" : "Não";
      case "movedLate": return movement?.movedLate ? "Sim" : "Não";
      case "notAttendedAt": return formatTimestamp(movement?.notAttendedAt);
      case "confirmedBy": return movement?.confirmedBy ?? "—";
      case "confirmedAt": return formatTimestamp(movement?.confirmedAt);
      case "updatedAt": return formatTimestamp(movement?.updatedAt);
    }
  };

  return (
    <section aria-label="Planilha completa" className="space-y-4">
      <div
        role="tablist"
        aria-label="Filtrar agendamentos"
        className="flex flex-wrap gap-2 rounded-2xl border border-[#a9b7c8] bg-[#eef3f8] p-3"
      >
        {[allReservationsTab, ...cartNames].map((name, index) => {
          const cartCount =
            name === allReservationsTab
              ? weekRows.length
              : filterReservationsByCart(weekRows, name).length;
          const selected = selectedCart === name;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onCartChange(name)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                selected
                  ? "border-[#345779] bg-[#345779] text-white shadow-sm"
                  : "border-[#c0ccda] bg-white text-[#31465f] hover:bg-[#f5f8fb]"
              }`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${selected ? "bg-white/15" : index === 0 ? "bg-slate-200 text-slate-700" : index % 3 === 1 ? "bg-blue-100 text-blue-800" : index % 3 === 2 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {name === allReservationsTab ? "∑" : name === "Reservas" ? "R" : name.match(/Carrinho\s+(.+)$/i)?.[1] ?? name.slice(0, 1)}
              </span>
              {name}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${selected ? "bg-white/15" : "bg-[#edf2f7]"}`}>{cartCount}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Agendamentos · {selectedCart}</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(var(--foreground))]">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Movimentações concluídas</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(var(--primary))]">{completedCount}</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Aguardando movimentação</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(34_60%_32%)]">{pendingCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Eye size={18} /></span>
          <div>
            <p className="text-sm font-semibold">Campos exibidos</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{visibleColumns.length} de {completeViewColumns.length} colunas · preferência salva neste navegador</p>
          </div>
        </div>
        <details className="group relative">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-xs font-semibold marker:hidden hover:bg-[hsl(var(--muted))]">
            Personalizar colunas <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 z-30 mt-2 max-h-[min(70vh,560px)] w-[min(90vw,460px)] overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--border))] pb-3">
              <p className="text-sm font-semibold">Escolha o que visualizar</p>
              <div className="flex gap-2">
                <button type="button" aria-label="Ver todas as colunas" onClick={() => onVisibleColumnsChange(completeViewColumns.map(({ key }) => key))} className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">Ver todas</button>
                <button type="button" onClick={() => onVisibleColumnsChange([...defaultCompleteViewColumns])} className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><RotateCcw size={12} /> Padrão</button>
              </div>
            </div>
            <div className="space-y-3">
              {allGroups.map((group) => {
                  const groupColumns = completeViewColumns.filter((column) => column.group === group);
                  const selectedCount = groupColumns.filter(({ key }) => visibleColumns.includes(key)).length;
                  return (
                    <fieldset key={group} className="rounded-lg border border-[hsl(var(--border))] p-3">
                      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group}</legend>
                      <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-[hsl(var(--border))] pb-2 text-xs font-semibold">
                        <input type="checkbox" checked={selectedCount === groupColumns.length} disabled={selectedCount === groupColumns.length && visibleColumns.length === groupColumns.length} ref={(element) => { if (element) element.indeterminate = selectedCount > 0 && selectedCount < groupColumns.length; }} onChange={() => toggleGroup(group)} className="h-4 w-4 accent-[hsl(var(--primary))] disabled:opacity-50" />
                        Selecionar grupo
                      </label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {groupColumns.map(({ key, label }) => (
                          <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-[hsl(var(--foreground))]">
                            <input type="checkbox" checked={visibleColumns.includes(key)} disabled={visibleColumns.length === 1 && visibleColumns.includes(key)} onChange={() => toggleColumn(key)} className="h-4 w-4 accent-[hsl(var(--primary))] disabled:opacity-50" />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
            </div>
            <p className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">Mantenha ao menos uma coluna visível. A configuração fica salva apenas neste navegador.</p>
          </div>
        </details>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Não há agendamentos para {selectedCart} nesta semana.
        </div>
      ) : <div
        aria-label="Planilha completa com rolagem horizontal"
        className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-[#a9b7c8] bg-[#eef3f8] shadow-sm"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[920px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="bg-[#345779] text-left text-white">
              {visibleGroups.map((group) => (
                <th key={group} colSpan={visibleColumnDefinitions.filter((column) => column.group === group).length} className="border-r border-white/20 px-2 py-1.5 text-[9px] font-bold uppercase tracking-[.12em] last:border-r-0">{group}</th>
              ))}
            </tr>
            <tr className="bg-[#e8eef6] text-[#173252]">
              {visibleColumnDefinitions.map(({ key, label }) => (
                <th key={key} scope="col" className="whitespace-nowrap border-b border-r border-[#c4d0df] px-2 py-2 font-bold last:border-r-0">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(periodFilter === "Todos" ? ["Manhã", "Tarde"] as const : [periodFilter]).map((period) => {
              const periodRows = rows.filter((reservation) => reservation.period === period);
              if (periodRows.length === 0) return null;
              return (
                <Fragment key={period}>
                  {periodFilter === "Todos" && (
                    <tr className={`border-y border-[#c4d0df] ${period === "Manhã" ? "bg-[#edf4ea] text-[#36552f]" : "bg-[#f4efe4] text-[#765b2f]"}`}>
                      <th colSpan={visibleColumnDefinitions.length} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">
                        Período da {period.toLocaleLowerCase("pt-BR")}
                      </th>
                    </tr>
                  )}
                  {periodRows.map((reservation, index) => {
                    const movement = movementById.get(reservation.id);
                    return (
                      <tr key={reservation.id} className={`border-b border-[#d5dce5] align-top text-[#25364a] last:border-b-0 hover:bg-[#edf4fa] ${index % 2 === 1 ? "bg-[#f7f9fb]" : "bg-white"}`}>
                        {visibleColumnDefinitions.map(({ key }) => (
                          <td key={key} className="max-w-72 whitespace-nowrap border-r border-[#e0e5eb] px-2 py-2 last:border-r-0">{renderCell(key, reservation, movement)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Mostrando {rows.length} agendamentos {selectedCart === allReservationsTab ? "de todos os carrinhos" : `de ${selectedCart}`} · use “Ver todas” no seletor de colunas para exibir todos os campos.</p>
    </section>
  );
}

type ReserveBookingForm = Pick<
  Reservation,
  "teacher" | "className" | "room" | "date" | "start" | "end" | "quantity"
>;

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const getLocalTime = (date = new Date()) => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};
const isValidLocalTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function ReserveAccess({
  dates,
  reservations,
  reserveUnits,
  reserveStockCount,
  reserveAssignments,
  teacherNames,
  rememberedPeople,
  onUpdateReserveUnitAssignments,
  onRememberResponsiblePerson,
  periodFilter,
  canEdit,
  onUpdateReservation,
}: {
  dates: Date[];
  reservations: Reservation[];
  reserveUnits: string[];
  reserveStockCount: number;
  reserveAssignments: Array<{ unit: string } & ReserveUnitAssignment>;
  teacherNames: string[];
  rememberedPeople: ReserveResponsiblePerson[];
  onUpdateReserveUnitAssignments: (
    units: string[],
    assignment: ReserveUnitAssignment | null,
  ) => void;
  onRememberResponsiblePerson: (
    name: string,
    personType: ReserveResponsiblePersonType,
  ) => void;
  periodFilter: PeriodFilter;
  canEdit: boolean;
  onUpdateReservation: (
    reservation: Omit<Reservation, "id" | "status">,
    id: number,
  ) => Promise<void>;
}) {
  const dateKeys = new Set(dates.map(formatDateKey));
  const bookings = reservations
    .filter(
      (reservation) =>
        reservation.kind === "Reserva" &&
        dateKeys.has(reservation.date) &&
        (periodFilter === "Todos" || reservation.period === periodFilter),
    )
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        first.start.localeCompare(second.start) ||
        first.teacher.localeCompare(second.teacher, "pt-BR"),
    );
  const allocations = new Map<number, string[]>();
  const unitBookings = new Map<string, Reservation[]>();
  const orderedReservations = reservations
    .filter((reservation) => reservation.kind === "Reserva")
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        first.start.localeCompare(second.start) ||
        first.end.localeCompare(second.end) ||
        first.id - second.id,
    );
  orderedReservations.forEach((reservation) => {
    const preferredUnits = reservation.reservedChromebooks?.filter((unit) =>
      reserveUnits.includes(unit),
    ) ?? [];
    const candidates = [
      ...new Set([...preferredUnits, ...reserveUnits]),
    ].filter((unit) => {
      const currentBookings = unitBookings.get(unit) ?? [];
      return currentBookings.every(
        (current) =>
          current.date !== reservation.date ||
          current.start >= reservation.end ||
          reservation.start >= current.end,
      );
    });
    const assigned = candidates.slice(0, reservation.quantity);
    allocations.set(reservation.id, assigned);
    assigned.forEach((unit) => {
      unitBookings.set(unit, [
        ...(unitBookings.get(unit) ?? []),
        reservation,
      ]);
    });
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ReserveBookingForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [assignmentTeacher, setAssignmentTeacher] = useState("");
  const [assignmentPersonType, setAssignmentPersonType] =
    useState<ReserveResponsiblePersonType>("Professor");
  const [assignmentDate, setAssignmentDate] = useState(getLocalDateKey);
  const [assignmentStart, setAssignmentStart] = useState(getLocalTime);
  const [assignmentError, setAssignmentError] = useState("");
  const [editingAssignmentUnit, setEditingAssignmentUnit] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] =
    useState<ReserveUnitAssignment | null>(null);
  const [serverTeacherNames, setServerTeacherNames] = useState<string[]>([]);
  const [teacherSuggestionError, setTeacherSuggestionError] = useState("");
  const dragSelectingRef = useRef(false);
  const dragBaseUnitRef = useRef<string | null>(null);
  const dragBaseSelectionRef = useRef<string[]>([]);
  const dragPathRef = useRef<string[]>([]);
  const dragMovedRef = useRef(false);
  const dragAdditiveRef = useRef(false);
  const mouseSelectionStartedRef = useRef(false);
  useEffect(() => {
    if (selectedUnits.length === 0) return;
    const clearSelectionOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      dragSelectingRef.current = false;
      dragPathRef.current = [];
      setSelectedUnits([]);
      setAssignmentError("");
    };
    window.addEventListener("keydown", clearSelectionOnEscape);
    return () => window.removeEventListener("keydown", clearSelectionOnEscape);
  }, [selectedUnits.length]);
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    void loadTeacherAccounts()
      .then((accounts) => {
        if (active) {
          setServerTeacherNames(
            accounts.map((account) => account.name.trim()).filter(Boolean),
          );
          setTeacherSuggestionError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setTeacherSuggestionError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os professores cadastrados.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [canEdit]);
  const normalizePersonName = (name: string) =>
    name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  const allTeacherNames = [...new Set([...teacherNames, ...serverTeacherNames])];
  const registeredTeacherNames = new Set(allTeacherNames.map(normalizePersonName));
  const personTypeForAssignment = (
    assignment: { teacher: string; personType?: ReserveResponsiblePersonType },
  ): ReserveResponsiblePersonType =>
    assignment.personType ??
    rememberedPeople.find(
      (person) => normalizePersonName(person.name) === normalizePersonName(assignment.teacher),
    )?.personType ??
    (registeredTeacherNames.has(normalizePersonName(assignment.teacher))
      ? "Professor"
      : "Funcionário/Autorizado");
  const manualRequests = Array.from(
    reserveAssignments.reduce((groups, assignment) => {
      if (
        !dateKeys.has(assignment.date) ||
        personTypeForAssignment(assignment) !== "Professor"
      ) {
        return groups;
      }

      const start = assignment.start?.slice(0, 5) ?? "";
      const key = `${normalizePersonName(assignment.teacher)}\u0000${assignment.date}\u0000${start}`;
      const group = groups.get(key) ?? {
        teacher: assignment.teacher,
        date: assignment.date,
        start,
        units: [] as string[],
      };
      group.units.push(assignment.unit);
      groups.set(key, group);
      return groups;
    }, new Map<string, { teacher: string; date: string; start: string; units: string[] }>())
      .values(),
  )
    .map((request) => ({
      ...request,
      units: request.units.sort((first, second) =>
        first.localeCompare(second, "pt-BR", { numeric: true }),
      ),
    }))
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        (first.start ?? "").localeCompare(second.start ?? "") ||
        first.teacher.localeCompare(second.teacher, "pt-BR"),
    );
  const manualRequestMatchesReservation = (request: {
    teacher: string;
    date: string;
    start?: string;
  }, reservation: Reservation) =>
    request.date === reservation.date &&
    normalizePersonName(request.teacher) === normalizePersonName(reservation.teacher) &&
    (!request.start || request.start === reservation.start.slice(0, 5));
  const manualRequestForReservation = (reservation: Reservation) => {
    const request = manualRequests.find((item) =>
      manualRequestMatchesReservation(item, reservation),
    );
    if (!request) return undefined;
    const firstMatchingReservation = bookings.find((booking) =>
      manualRequestMatchesReservation(request, booking),
    );
    return firstMatchingReservation?.id === reservation.id ? request : undefined;
  };
  const unlinkedManualRequests = manualRequests.filter(
    (request) =>
      !bookings.some((booking) =>
        manualRequestMatchesReservation(request, booking),
      ),
  );
  const knownPersonTypeForName = (
    name: string,
  ): ReserveResponsiblePersonType | undefined => {
    const normalizedName = normalizePersonName(name);
    if (registeredTeacherNames.has(normalizedName)) return "Professor";
    const remembered = rememberedPeople.find(
      (person) => normalizePersonName(person.name) === normalizedName,
    );
    if (remembered) return remembered.personType;
    const previouslyUsed = reserveAssignments.find(
      (assignment) => normalizePersonName(assignment.teacher) === normalizedName,
    );
    return previouslyUsed ? personTypeForAssignment(previouslyUsed) : undefined;
  };
  const sortedAssignments = reserveAssignments
    .map((assignment) => ({
      ...assignment,
      personType: personTypeForAssignment(assignment),
    }))
    .sort((first, second) =>
      first.personType.localeCompare(second.personType, "pt-BR") ||
      first.teacher.localeCompare(second.teacher, "pt-BR") ||
      first.unit.localeCompare(second.unit, "pt-BR", { numeric: true }),
    );
  const assignmentGroups = Array.from(
    sortedAssignments.reduce((groups, assignment) => {
      const key = `${assignment.personType}\u0000${normalizePersonName(assignment.teacher)}`;
      const group = groups.get(key) ?? {
        teacher: assignment.teacher,
        personType: assignment.personType,
        assignments: [],
      };
      group.assignments.push(assignment);
      groups.set(key, group);
      return groups;
    }, new Map<string, {
      teacher: string;
      personType: ReserveResponsiblePersonType;
      assignments: typeof sortedAssignments;
    }>()).values(),
  );
  const responsibleSuggestions = [...new Set([
    ...allTeacherNames,
    ...rememberedPeople.map((person) => person.name),
    ...reserveAssignments.map((assignment) => assignment.teacher),
  ])].sort((first, second) => first.localeCompare(second, "pt-BR"));
  const selectReserveUnit = (
    unit: string,
    additive: boolean,
  ) => {
    setSelectedUnits((current) => {
      if (!additive) {
        return current.length === 1 && current.includes(unit) ? [] : [unit];
      }
      return current.includes(unit)
        ? current.filter((selected) => selected !== unit)
        : [...current, unit];
    });
  };
  const updateAssignmentTeacher = (name: string) => {
    setAssignmentTeacher(name);
    if (!name.trim()) {
      setAssignmentPersonType("Professor");
      return;
    }
    const knownPersonType = knownPersonTypeForName(name);
    if (knownPersonType) setAssignmentPersonType(knownPersonType);
  };
  const updateEditingAssignmentTeacher = (name: string) => {
    const knownPersonType = knownPersonTypeForName(name);
    setEditingAssignment((current) =>
      current
        ? {
            ...current,
            teacher: name,
            ...(knownPersonType ? { personType: knownPersonType } : {}),
          }
        : current,
    );
  };
  const saveManualAssignment = () => {
    const teacher = assignmentTeacher.trim().replace(/\s+/g, " ");
    const date = new Date(`${assignmentDate}T12:00:00`);
    if (selectedUnits.length === 0) {
      setAssignmentError("Selecione ao menos um Chromebook disponível.");
      return;
    }
    if (!teacher) {
      setAssignmentError("Informe o nome de quem está responsável pelos Chromebooks.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assignmentDate) ||
      Number.isNaN(date.getTime()) ||
      getLocalDateKey(date) !== assignmentDate) {
      setAssignmentError("Informe uma data válida.");
      return;
    }
    if (!isValidLocalTime(assignmentStart)) {
      setAssignmentError("Informe um horário válido.");
      return;
    }
    onUpdateReserveUnitAssignments(selectedUnits, {
      teacher,
      date: assignmentDate,
      start: assignmentStart,
      personType: assignmentPersonType,
    });
    onRememberResponsiblePerson(teacher, assignmentPersonType);
    setSelectedUnits([]);
    setAssignmentTeacher("");
    setAssignmentPersonType("Professor");
    setAssignmentDate(getLocalDateKey());
    setAssignmentStart(getLocalTime());
    setAssignmentError("");
  };
  const saveManualAssignmentEdit = (unit: string) => {
    const teacher = editingAssignment?.teacher.trim().replace(/\s+/g, " ") ?? "";
    const date = editingAssignment?.date ?? "";
    const start = editingAssignment?.start ?? "";
    const personType =
      editingAssignment?.personType ??
      knownPersonTypeForName(teacher) ??
      "Funcionário/Autorizado";
    const parsedDate = new Date(`${date}T12:00:00`);
    if (!teacher || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsedDate.getTime()) ||
      getLocalDateKey(parsedDate) !== date ||
      !isValidLocalTime(start)) {
      setAssignmentError("Informe um responsável, uma data e um horário válidos.");
      return;
    }
    onUpdateReserveUnitAssignments([unit], { teacher, date, start, personType });
    onRememberResponsiblePerson(teacher, personType);
    setEditingAssignmentUnit(null);
    setEditingAssignment(null);
    setAssignmentError("");
  };

  const startEditing = (reservation: Reservation) => {
    setEditingId(reservation.id);
    setForm({
      teacher: reservation.teacher,
      className: reservation.className,
      room: reservation.room,
      date: reservation.date,
      start: reservation.start,
      end: reservation.end,
      quantity: reservation.quantity,
    });
    setError("");
  };
  const cancelEditing = () => {
    setEditingId(null);
    setForm(null);
    setError("");
  };
  const updateForm = (key: keyof ReserveBookingForm, value: string) => {
    setForm((current) =>
      current
        ? {
            ...current,
            [key]: key === "quantity" ? Number(value) : value,
          }
        : current,
    );
  };
  const saveEditing = async (reservation: Reservation) => {
    if (!form || saving) return;
    if (form.start >= form.end) {
      setError("O horário inicial deve ser anterior ao final.");
      return;
    }
    if (!Number.isInteger(form.quantity) || form.quantity < 1) {
      setError("Informe uma quantidade válida de Chromebooks.");
      return;
    }
    if (reserveUnits.length > 0 && form.quantity > reserveUnits.length) {
      setError(
        `A quantidade não pode exceder as ${reserveUnits.length} unidades separadas para reserva.`,
      );
      return;
    }
    setSaving(true);
    setError("");
    const { id: _id, status: _status, ...current } = reservation;
    try {
      await onUpdateReservation(
        {
          ...current,
          ...form,
          teacher: form.teacher.trim().replace(/\s+/g, " "),
          className: form.className.trim().replace(/\s+/g, " "),
          room: form.room.trim().replace(/\s+/g, " "),
          cart: "Reservas",
          kind: "Reserva",
          reservedChromebooks: undefined,
        },
        reservation.id,
      );
      cancelEditing();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a edição da reserva.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Planilha de Chromebooks de reserva" className="space-y-4">
      <div className="rounded-2xl border border-[#a9b7c8] bg-[#eef3f8] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Laptop size={17} className="text-[#345779]" />
            <h2 className="text-sm font-bold text-[#173252]">
              Chromebooks separados para reserva
            </h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#31465f]">
            {reserveUnits.length} disponíveis / {reserveStockCount} em reserva
          </span>
        </div>
        <p className="mb-3 text-[11px] text-slate-600">
          Clique para selecionar uma unidade; segure Ctrl (ou Cmd no Mac) para selecionar várias, ou arraste sobre as unidades. Volte pelo caminho do arraste para desmarcar as unidades percorridas.
        </p>
        {reserveUnits.length > 0 ? (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Unidades de Chromebook de reserva"
            onMouseUp={() => { dragSelectingRef.current = false; }}
            onMouseLeave={() => { dragSelectingRef.current = false; }}
          >
            {reserveUnits.map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={selectedUnits.includes(unit)}
                aria-label={`Selecionar Chromebook ${unit}`}
                data-testid={`reserve-unit-${unit}`}
                onMouseDown={(event) => {
                  if (!canEdit) return;
                  event.preventDefault();
                  const additive = event.ctrlKey || event.metaKey;
                  const wasSelected =
                    selectedUnits.includes(unit) && selectedUnits.length === 1;
                  dragSelectingRef.current = true;
                  mouseSelectionStartedRef.current = true;
                  dragBaseUnitRef.current = unit;
                  dragPathRef.current = [];
                  dragMovedRef.current = false;
                  dragAdditiveRef.current = additive;
                  const nextSelection = additive
                    ? selectedUnits.includes(unit)
                      ? selectedUnits.filter((selected) => selected !== unit)
                      : [...selectedUnits, unit]
                    : wasSelected
                      ? []
                      : [unit];
                  dragBaseSelectionRef.current = nextSelection;
                  setSelectedUnits(nextSelection);
                }}
                onMouseEnter={() => {
                  if (!canEdit || !dragSelectingRef.current) return;
                  dragMovedRef.current = true;
                  const currentPath = dragPathRef.current;
                  const unitPathIndex = currentPath.indexOf(unit);
                  const nextPath = unit === dragBaseUnitRef.current
                    ? []
                    : unitPathIndex >= 0
                      ? currentPath.slice(0, unitPathIndex + 1)
                      : [...currentPath, unit];
                  dragPathRef.current = nextPath;
                  setSelectedUnits([
                    ...new Set([...dragBaseSelectionRef.current, ...nextPath]),
                  ]);
                }}
                onClick={(event) => {
                  if (mouseSelectionStartedRef.current) {
                    mouseSelectionStartedRef.current = false;
                    if (dragMovedRef.current) {
                      dragMovedRef.current = false;
                      return;
                    }
                    dragAdditiveRef.current = false;
                    return;
                  }
                  if (dragMovedRef.current) {
                    dragMovedRef.current = false;
                    return;
                  }
                  selectReserveUnit(
                    unit,
                    event.ctrlKey || event.metaKey || dragAdditiveRef.current,
                  );
                  dragAdditiveRef.current = false;
                }}
                className={`select-none rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${
                  selectedUnits.includes(unit)
                    ? "border-[#345779] bg-[#345779] text-white"
                    : "border-[#c0ccda] bg-white text-[#31465f] hover:bg-[#f5f8fb]"
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {reserveStockCount > 0
              ? "Todas as unidades de reserva disponíveis estão atribuídas. Apague uma atribuição para devolvê-las à fila."
              : "Nenhum Chromebook está disponível na categoria Reserva. Configure ou libere unidades na tela Carrinhos."}
          </p>
        )}
        {canEdit && selectedUnits.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#c0ccda] bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#173252]">
                Atribuir {selectedUnits.length} Chromebook{selectedUnits.length === 1 ? "" : "s"} selecionado{selectedUnits.length === 1 ? "" : "s"}:{" "}
                <span className="ml-1 font-mono">{selectedUnits.join(", ")}</span>
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Cancelar seleção"
                onClick={() => {
                  setSelectedUnits([]);
                  setAssignmentError("");
                }}
                data-testid="button-cancel-reserve-selection"
              >
                <X size={14} /> Cancelar seleção
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(11rem,1.2fr)_auto_auto_auto]">
              <select
                aria-label="Categoria do responsável"
                value={assignmentPersonType}
                onChange={(event) =>
                  setAssignmentPersonType(
                    event.target.value === "Professor"
                      ? "Professor"
                      : "Funcionário/Autorizado",
                  )
                }
                className="rounded border border-[#c0ccda] bg-white px-2 py-1.5 text-sm text-[#173252]"
              >
                <option value="Professor">Professor cadastrado</option>
                <option value="Funcionário/Autorizado">Funcionário / autorizado</option>
              </select>
              <ResponsibleNameCombobox
                label="Nome do responsável pelos Chromebooks"
                placeholder="Professor, funcionário ou autorizado"
                value={assignmentTeacher}
                suggestions={responsibleSuggestions}
                onChange={updateAssignmentTeacher}
                onSelect={updateAssignmentTeacher}
                className="w-full rounded border border-[#c0ccda] bg-white px-2 py-1.5 text-sm text-[#173252]"
              />
              <input
                aria-label="Data de atribuição dos Chromebooks"
                type="date"
                required
                value={assignmentDate}
                onChange={(event) => setAssignmentDate(event.target.value)}
                className="rounded border border-[#c0ccda] bg-white px-2 py-1.5 text-sm text-[#173252]"
              />
              <input
                aria-label="Horário de atribuição dos Chromebooks"
                type="time"
                required
                value={assignmentStart}
                onChange={(event) => setAssignmentStart(event.target.value)}
                className="rounded border border-[#c0ccda] bg-white px-2 py-1.5 text-sm text-[#173252]"
              />
              <Button size="sm" onClick={saveManualAssignment} data-testid="button-assign-reserve-units">
                Salvar na planilha
              </Button>
            </div>
            {assignmentError && <p className="mt-2 text-xs text-red-700" role="alert">{assignmentError}</p>}
            {teacherSuggestionError && (
              <p className="mt-2 text-xs text-amber-800" role="alert">
                Não foi possível atualizar as sugestões de professores: {teacherSuggestionError}
              </p>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              A data e o horário começam preenchidos com o momento atual. Você pode ajustar ambos. As unidades ficam fora da fila até a atribuição ser apagada.
            </p>
          </div>
        )}
      </div>

      {sortedAssignments.length > 0 && (
        <div className="space-y-3">
          <div className="border-b border-[#c4d0df] bg-[#eef3f8] px-4 py-3">
            <h3 className="text-sm font-bold text-[#173252]">
              Chromebooks sob responsabilidade
            </h3>
          </div>
          {assignmentGroups.map((group) => (
            <section
              key={`${group.personType}-${normalizePersonName(group.teacher)}`}
              className="overflow-hidden rounded-2xl border border-[#a9b7c8] bg-white shadow-sm"
              data-testid={`reserve-assignment-group-${normalizePersonName(group.teacher).replace(/[^a-z0-9]+/g, "-")}`}
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#c4d0df] bg-[#eef3f8] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-[#173252]">{group.teacher}</h4>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[#345779]">
                    {group.personType}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-600">
                    {group.assignments.length} Chromebook{group.assignments.length === 1 ? "" : "s"}
                  </span>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const units = group.assignments.map((assignment) => assignment.unit);
                        onUpdateReserveUnitAssignments(units, null);
                        if (editingAssignmentUnit && units.includes(editingAssignmentUnit)) {
                          setEditingAssignmentUnit(null);
                          setEditingAssignment(null);
                        }
                      }}
                      data-testid={`button-return-reserve-group-${normalizePersonName(group.teacher).replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      Todos devolvido
                    </Button>
                  )}
                </div>
              </header>
              <div className="divide-y divide-[#e0e5eb]">
                {group.assignments.map(({ unit, teacher, date, start, personType }) => {
                  const editing = editingAssignmentUnit === unit && editingAssignment;
                  return (
                    <div
                      key={unit}
                      className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-[#25364a]"
                      data-testid={`reserve-assignment-${unit}`}
                    >
                      <span className="min-w-16 font-mono font-bold">{unit}</span>
                      {editing ? (
                        <div className="grid flex-1 gap-2 sm:grid-cols-4">
                          <ResponsibleNameCombobox
                            label={`Responsável pelo Chromebook ${unit}`}
                            value={editingAssignment.teacher}
                            suggestions={responsibleSuggestions}
                            onChange={updateEditingAssignmentTeacher}
                            onSelect={updateEditingAssignmentTeacher}
                            className="w-full rounded border border-[#c0ccda] px-2 py-1"
                          />
                          <select
                            aria-label={`Categoria do responsável pelo Chromebook ${unit}`}
                            value={editingAssignment.personType ?? personType}
                            onChange={(event) =>
                              setEditingAssignment({
                                ...editingAssignment,
                                personType: event.target.value === "Professor"
                                  ? "Professor"
                                  : "Funcionário/Autorizado",
                              })
                            }
                            className="rounded border border-[#c0ccda] px-2 py-1"
                          >
                            <option value="Professor">Professor cadastrado</option>
                            <option value="Funcionário/Autorizado">Funcionário / autorizado</option>
                          </select>
                          <input
                            aria-label={`Data do Chromebook ${unit}`}
                            type="date"
                            required
                            value={editingAssignment.date}
                            onChange={(event) =>
                              setEditingAssignment({ ...editingAssignment, date: event.target.value })
                            }
                            className="rounded border border-[#c0ccda] px-2 py-1"
                          />
                          <input
                            aria-label={`Horário do Chromebook ${unit}`}
                            type="time"
                            required
                            value={editingAssignment.start ?? ""}
                            onChange={(event) =>
                              setEditingAssignment({ ...editingAssignment, start: event.target.value })
                            }
                            className="rounded border border-[#c0ccda] px-2 py-1"
                          />
                        </div>
                      ) : (
                        <span className="flex-1 text-slate-600">
                          Data: {dateFormatter.format(new Date(`${date}T12:00:00`))} · Horário: {start?.slice(0, 5) || "não informado"}
                        </span>
                      )}
                      {canEdit && (
                        <div className="flex gap-2">
                          {editing ? (
                            <>
                              <Button size="sm" onClick={() => saveManualAssignmentEdit(unit)} data-testid={`button-save-reserve-assignment-${unit}`}>Salvar</Button>
                              <Button size="sm" variant="secondary" onClick={() => { setEditingAssignmentUnit(null); setEditingAssignment(null); setAssignmentError(""); }}>Cancelar</Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => {
                                setEditingAssignmentUnit(unit);
                                setEditingAssignment({ teacher, date, start, personType });
                                setAssignmentError("");
                              }} data-testid={`button-edit-reserve-assignment-${unit}`}>Editar</Button>
                              <Button size="sm" variant="secondary" onClick={() => {
                                onUpdateReserveUnitAssignments([unit], null);
                              }} data-testid={`button-delete-reserve-assignment-${unit}`}>Devolvido</Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {assignmentError && editingAssignmentUnit &&
                group.assignments.some((assignment) => assignment.unit === editingAssignmentUnit) && (
                  <p className="px-4 py-2 text-xs text-red-700" role="alert">{assignmentError}</p>
                )}
            </section>
          ))}
        </div>
      )}

      {bookings.length === 0 && unlinkedManualRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Nenhum professor solicitou Chromebooks de reserva nesta semana.
        </div>
      ) : (
        <div
          aria-label="Solicitações de Chromebook de reserva com rolagem horizontal"
          className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-[#a9b7c8] bg-white shadow-sm"
          role="region"
          tabIndex={0}
        >
          <table className="w-full min-w-[980px] border-collapse text-left text-xs">
            <thead>
              <tr className="bg-[#345779] text-white">
                <th scope="col" className="px-3 py-3">Data e horário</th>
                <th scope="col" className="px-3 py-3">Professor e turma</th>
                <th scope="col" className="px-3 py-3">Sala</th>
                <th scope="col" className="px-3 py-3">Chromebooks de reserva</th>
                <th scope="col" className="px-3 py-3">Quantidade</th>
                {canEdit && <th scope="col" className="px-3 py-3">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {unlinkedManualRequests.map((request) => (
                <tr
                  key={`${request.date}-${normalizePersonName(request.teacher)}`}
                  className="border-b border-[#d5dce5] align-top text-[#25364a] last:border-b-0"
                  data-testid="reserve-manual-request-row"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="block font-semibold">
                      {dateFormatter.format(new Date(`${request.date}T12:00:00`))}
                    </span>
                    <span className="mt-1 block">Atribuição manual · Horário: {request.start || "não informado"}</span>
                  </td>
                  <td className="min-w-52 px-3 py-3">
                    <span className="block font-semibold">{request.teacher}</span>
                    <span className="mt-1 block">Responsável informado pelo administrador</span>
                  </td>
                  <td className="px-3 py-3">—</td>
                  <td className="px-3 py-3 font-mono">{request.units.join(", ")}</td>
                  <td className="px-3 py-3 font-semibold">{request.units.length}</td>
                  {canEdit && <td className="px-3 py-3">Gerenciada no bloco acima</td>}
                </tr>
              ))}
              {bookings.map((reservation) => {
                const rowEditing = editingId === reservation.id && form;
                const manualRequest = manualRequestForReservation(reservation);
                const assignedUnits = manualRequest?.units ??
                  allocations.get(reservation.id) ?? [];
                return (
                  <Fragment key={reservation.id}>
                    <tr className="border-b border-[#d5dce5] align-top text-[#25364a] last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-3">
                        {rowEditing ? (
                          <div className="grid gap-2">
                            <input
                              aria-label={`Data da reserva de ${reservation.teacher}`}
                              type="date"
                              required
                              value={form.date}
                              disabled={saving}
                              onChange={(event) => updateForm("date", event.target.value)}
                              className="rounded border border-[#c0ccda] bg-white px-2 py-1.5"
                            />
                            <div className="flex items-center gap-1">
                              <input
                                aria-label={`Início da reserva de ${reservation.teacher}`}
                                type="time"
                                required
                                value={form.start}
                                disabled={saving}
                                onChange={(event) => updateForm("start", event.target.value)}
                                className="w-28 rounded border border-[#c0ccda] bg-white px-2 py-1.5"
                              />
                              <span>–</span>
                              <input
                                aria-label={`Fim da reserva de ${reservation.teacher}`}
                                type="time"
                                required
                                value={form.end}
                                disabled={saving}
                                onChange={(event) => updateForm("end", event.target.value)}
                                className="w-28 rounded border border-[#c0ccda] bg-white px-2 py-1.5"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className="block font-semibold">
                              {dateFormatter.format(new Date(`${reservation.date}T12:00:00`))}
                            </span>
                            <span className="mt-1 block font-mono">
                              {reservation.start}–{reservation.end}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="min-w-52 px-3 py-3">
                        {rowEditing ? (
                          <div className="grid gap-2">
                            <input
                              aria-label={`Professor da reserva ${reservation.id}`}
                              required
                              maxLength={120}
                              value={form.teacher}
                              disabled={saving}
                              onChange={(event) => updateForm("teacher", event.target.value)}
                              className="rounded border border-[#c0ccda] bg-white px-2 py-1.5"
                            />
                            <input
                              aria-label={`Turma da reserva ${reservation.id}`}
                              required
                              maxLength={80}
                              value={form.className}
                              disabled={saving}
                              onChange={(event) => updateForm("className", event.target.value)}
                              className="rounded border border-[#c0ccda] bg-white px-2 py-1.5"
                            />
                          </div>
                        ) : (
                          <>
                            <span className="block font-semibold">{reservation.teacher}</span>
                            <span className="mt-1 block text-[hsl(var(--muted-foreground))]">
                              {reservation.className}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {rowEditing ? (
                          <input
                            aria-label={`Sala da reserva ${reservation.id}`}
                            required
                            maxLength={80}
                            value={form.room}
                            disabled={saving}
                            onChange={(event) => updateForm("room", event.target.value)}
                            className="w-36 rounded border border-[#c0ccda] bg-white px-2 py-1.5"
                          />
                        ) : (
                          reservation.room
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {assignedUnits.length > 0 ? (
                          <div className="flex max-w-72 flex-wrap gap-1.5">
                            {assignedUnits.map((unit) => (
                              <span key={unit} className="rounded bg-[#eef3f8] px-2 py-1 font-mono">
                                {unit}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[hsl(var(--destructive))]">
                            Nenhuma unidade disponível
                          </span>
                        )}
                        {assignedUnits.length < reservation.quantity && (
                          <span className="mt-1 block text-[10px] text-[hsl(var(--destructive))]">
                            Alocadas {assignedUnits.length} de {reservation.quantity}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {rowEditing ? (
                          <input
                            aria-label={`Quantidade da reserva ${reservation.id}`}
                            type="number"
                            required
                            min={1}
                            max={reserveUnits.length || undefined}
                            value={form.quantity}
                            disabled={saving}
                            onChange={(event) => updateForm("quantity", event.target.value)}
                            className="w-24 rounded border border-[#c0ccda] bg-white px-2 py-1.5"
                          />
                        ) : (
                          reservation.quantity
                        )}
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap px-3 py-3">
                          {rowEditing ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => void saveEditing(reservation)}
                                disabled={saving}
                                data-testid={`button-save-reserve-${reservation.id}`}
                              >
                                <Save size={13} /> Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={cancelEditing}
                                disabled={saving}
                              >
                                <X size={13} /> Cancelar
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => startEditing(reservation)}
                              data-testid={`button-edit-reserve-${reservation.id}`}
                            >
                              <Pencil size={13} /> Editar
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                    {rowEditing && error && (
                      <tr className="border-b border-[#d5dce5]">
                        <td
                          colSpan={canEdit ? 6 : 5}
                          className="px-3 pb-3 text-xs font-semibold text-[hsl(var(--destructive))]"
                          role="alert"
                        >
                          {error}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        As solicitações dos professores entram automaticamente pela agenda compartilhada. A alocação das unidades considera os horários para não atribuir o mesmo Chromebook a duas reservas simultâneas.
      </p>
    </section>
  );
}

export function SpreadsheetViewPage({ readOnly = false }: { readOnly?: boolean }) {
  const {
    reservations,
    movements,
    carts,
    cartSchedules,
    movementSettings,
    teacherAccounts = [],
    campusSettings = defaultCampusSettings,
    replaceReservations,
    updateReserveUnitAssignments,
    rememberReserveResponsiblePerson,
  } = useCampusData();
  const session = getAuthenticatedSession();
  const canDirectBook =
    !readOnly && session?.role === "admin";
  const currentTeacherName =
    readOnly && session?.role === "user" ? session.name : "";
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [teacherProfileError, setTeacherProfileError] = useState("");
  const [teacherAccessAccounts, setTeacherAccessAccounts] = useState<TeacherAccessAccount[]>([]);
  const [teacherAccessAccountsError, setTeacherAccessAccountsError] = useState("");
  const canTeacherBook = Boolean(currentTeacherName && teacherProfile);
  const {
    floorForRoom,
    classEntries = [],
    roomOptions = [],
    roomCatalogLoading = false,
    roomsSyncError = "",
  } = useRoomDirectory();
  const [mode, setMode] = useState<SpreadsheetMode>(() => readSpreadsheetMode(readOnly));
  const [teacherReservations, setTeacherReservations] = useState<Reservation[]>([]);
  const [teacherReservationsLoading, setTeacherReservationsLoading] = useState(readOnly);
  const [teacherReservationsLoaded, setTeacherReservationsLoaded] = useState(false);
  const [teacherReservationsError, setTeacherReservationsError] = useState("");
  const [selectedCompleteCart, setSelectedCompleteCart] = useState(() => {
    try {
      return window.localStorage.getItem(completeCartStorageKey) ?? "Carrinho A";
    } catch {
      return "Carrinho A";
    }
  });
  const [visibleColumns, setVisibleColumns] = useState<CompleteViewColumnKey[]>(() => {
    try {
      const saved = window.localStorage.getItem(completeColumnsStorageKey);
      return saved
        ? getVisibleCompleteViewColumns(JSON.parse(saved))
        : [...defaultCompleteViewColumns];
    } catch {
      return [...defaultCompleteViewColumns];
    }
  });
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date(`${todayISO()}T12:00:00`),
  );
  const [quickAccessFocus, setQuickAccessFocus] = useState(() => ({
    date: todayISO(),
    id: 0,
  }));
  const quickAccessFocusIdRef = useRef(0);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("Todos");
  const weekStart = getMondayOfWeek(selectedDate);
  const weekDates = getWeekDates(weekStart);
  const workWeekDates = weekDates;
  const isTeacherView = readOnly && session?.role === "user";
  const todayDate = todayISO();
  const currentWeekStart = formatDateKey(
    getMondayOfWeek(new Date(`${todayDate}T12:00:00`)),
  );
  const quickAccessDates = isTeacherView &&
      formatDateKey(weekStart) >= currentWeekStart
    ? workWeekDates.filter((date) => formatDateKey(date) >= todayDate)
    : workWeekDates;
  const teacherFrom = formatDateKey(workWeekDates[0]);
  const teacherTo = formatDateKey(workWeekDates.at(-1)!);
  const teacherSegments: Segment[] = teacherProfile
    ? [...new Set([teacherProfile.segment, ...(teacherProfile.additionalSegments ?? [])])]
    : [];
  const teacherProfileClassName = teacherProfile?.className ?? "";
  const visibleReservations = readOnly ? teacherReservations : reservations;
  useEffect(() => {
    if (!canDirectBook) {
      setTeacherAccessAccounts([]);
      setTeacherAccessAccountsError("");
      return;
    }
    let active = true;
    void loadTeacherAccounts()
      .then((accounts) => {
        if (!active) return;
        setTeacherAccessAccounts(accounts);
        setTeacherAccessAccountsError("");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setTeacherAccessAccountsError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar os professores cadastrados.",
        );
      });
    return () => {
      active = false;
    };
  }, [canDirectBook]);
  const floorSuggestions = getFloorOptimizationSuggestions(
    visibleReservations,
    floorForRoom,
    workWeekDates.map(formatDateKey),
  );
  useEffect(() => {
    if (!readOnly) return;
    let active = true;
    const refreshTeacherReservations = () => {
      void loadTeacherSpreadsheetReservations(teacherFrom, teacherTo)
        .then((items) => {
          if (!active) return;
          setTeacherReservations((current) =>
            JSON.stringify(current) === JSON.stringify(items) ? current : items,
          );
          setTeacherReservationsLoaded(true);
          setTeacherReservationsError("");
        })
        .catch((error: unknown) => {
          if (!active) return;
          setTeacherReservationsError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a planilha de visualização.",
          );
        })
        .finally(() => {
          if (active) setTeacherReservationsLoading(false);
        });
    };
    refreshTeacherReservations();
    const interval = window.setInterval(refreshTeacherReservations, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [readOnly, teacherFrom, teacherTo]);
  useEffect(() => {
    if (!readOnly || session?.role !== "user") return;
    let active = true;
    void loadTeacherProfile()
      .then((profile) => {
        if (!active) return;
        setTeacherProfile(profile);
        setTeacherProfileError("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setTeacherProfileError(
          error instanceof Error ? error.message : "Não foi possível carregar seu perfil.",
        );
      });
    return () => {
      active = false;
    };
  }, [readOnly, session?.role]);
  const cartNames = useMemo(
    () =>
      sortCartNames([
        ...carts.map((cart) => cart.name),
        ...visibleReservations.map((reservation) => reservation.cart),
      ]),
    [carts, visibleReservations],
  );
  const reserveUnits = useMemo(
    () =>
      [
        ...new Set(
          carts.flatMap((cart: Cart) =>
            (cart.reservedUnits ?? []).filter(
              (unit) =>
                !cart.unavailable &&
                !(cart.unavailableUnits ?? []).includes(unit) &&
                !cart.reserveAssignments?.[unit],
            ),
          ),
        ),
      ].sort((first, second) =>
        first.localeCompare(second, "pt-BR", { numeric: true }),
      ),
    [carts],
  );
  const reserveStockCount = useMemo(
    () =>
      new Set(
        carts.flatMap((cart: Cart) =>
          (cart.reservedUnits ?? []).filter(
            (unit) =>
              !cart.unavailable &&
              !(cart.unavailableUnits ?? []).includes(unit),
          ),
        ),
      ).size,
    [carts],
  );
  const reserveAssignments = useMemo(
    () =>
      carts.flatMap((cart: Cart) =>
      Object.entries(cart.reserveAssignments ?? {}).map(([unit, assignment]) => ({
        unit,
        ...assignment,
      })),
      ),
    [carts],
  );

  const moveWeek = (amount: number) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + amount * 7);
    setSelectedDate(next);
  };
  const focusSpreadsheetDate = (date: string) => {
    setSelectedDate(new Date(`${date}T12:00:00`));
    quickAccessFocusIdRef.current += 1;
    setQuickAccessFocus({ date, id: quickAccessFocusIdRef.current });
  };
  const focusTomorrow = () => {
    focusSpreadsheetDate(nextBookableWeekday(new Date(`${todayISO()}T12:00:00`)));
  };
  const saveVisibleColumns = (columns: CompleteViewColumnKey[]) => {
    setVisibleColumns(columns);
    window.localStorage.setItem(completeColumnsStorageKey, JSON.stringify(columns));
  };
  const selectCompleteCart = (cartName: string) => {
    setSelectedCompleteCart(cartName);
    window.localStorage.setItem(completeCartStorageKey, cartName);
  };
  const selectSpreadsheetMode = (nextMode: SpreadsheetMode) => {
    setMode(nextMode);
    try {
      window.localStorage.setItem(spreadsheetModeStorageKey, nextMode);
    } catch {
      // The selected mode still applies for this visit when storage is unavailable.
    }
  };
  const moveReservation = async (reservation: Reservation) => {
    if (readOnly) throw new Error("A visualização da planilha é somente para consulta.");
    const { id, status: _status, ...data } = reservation;
    await saveSharedReservation(data, id);
    const synchronizedReservations = await loadSharedReservations().catch(() => null);
    if (synchronizedReservations) {
      replaceReservations(synchronizedReservations);
    } else {
      replaceReservations(
        reservations.map((current) =>
          current.id === id ? reservation : current,
        ),
      );
      void requestSharedReservationsRefresh();
    }
  };
  const createReservationFromSheet = async (
    reservation: Omit<Reservation, "id" | "status">,
  ) => {
    if (readOnly && canTeacherBook) {
      if (reservation.date < todayISO()) {
        throw new Error("Não é possível agendar em uma data que já passou.");
      }
      if (
        reservation.teacher.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR") !==
        currentTeacherName.toLocaleLowerCase("pt-BR")
      ) {
        throw new Error("Você só pode reservar horários em seu próprio nome.");
      }
      await saveSharedReservation(reservation);
      try {
        const updatedReservations = await loadTeacherSpreadsheetReservations(
          teacherFrom,
          teacherTo,
        );
        setTeacherReservations((current) =>
          JSON.stringify(current) === JSON.stringify(updatedReservations)
            ? current
            : updatedReservations,
        );
        setTeacherReservationsLoaded(true);
        setTeacherReservationsError("");
      } catch (error) {
        setTeacherReservationsError(
          `Reserva salva, mas a planilha não pôde ser atualizada agora. ${error instanceof Error ? error.message : ""}`.trim(),
        );
      }
      return;
    }
    if (readOnly || !canDirectBook) {
      throw new Error("Somente a administração pode criar reservas diretamente na planilha.");
    }
    await saveSharedReservation(reservation);
    replaceReservations(await loadSharedReservations());
  };
  const updateReservationFromSheet = async (
    reservation: Omit<Reservation, "id" | "status">,
    id: number,
  ) => {
    if (!canDirectBook) {
      throw new Error("Somente a administração pode editar agendamentos pela planilha.");
    }
    await saveSharedReservation(reservation, id);
    replaceReservations(await loadSharedReservations());
  };
  const deleteReservationFromSheet = async (reservation: Reservation) => {
    if (!canDirectBook) {
      throw new Error("Somente a administração pode excluir agendamentos pela planilha.");
    }
    await deleteSharedReservation(reservation.id);
    replaceReservations(reservations.filter((current) => current.id !== reservation.id));
    void requestSharedReservationsRefresh();
  };
  const moveReservationsToCart = async (movedReservations: Reservation[]) => {
    if (readOnly) throw new Error("A visualização da planilha é somente para consulta.");
    if (movedReservations.length === 0) return;
    try {
      await moveSharedReservationsToCart(movedReservations);
    } catch (error) {
      const synchronizedReservations = await loadSharedReservations().catch(() => null);
      if (synchronizedReservations) {
        replaceReservations(synchronizedReservations);
      } else {
        void requestSharedReservationsRefresh();
      }
      throw error;
    }
    const synchronizedReservations = await loadSharedReservations().catch(() => null);
    if (synchronizedReservations) {
      replaceReservations(synchronizedReservations);
      return;
    }
    const movedById = new Map(movedReservations.map((reservation) => [reservation.id, reservation]));
    replaceReservations(
      reservations.map((current) => movedById.get(current.id) ?? current),
    );
    void requestSharedReservationsRefresh();
  };

  return (
    <div className="animate-rise w-full min-w-0 max-w-full space-y-6">
      <PageHeader
        eyebrow={readOnly ? "Área do professor" : "Área do TI e Administração"}
        title="Planilha"
        description={readOnly
          ? "Consulte a disponibilidade e reserve um ou mais horários para você."
          : "Consulte, organize e mova os agendamentos em formato de planilha semanal."}
      />

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => moveWeek(-1)}
            aria-label={isTeacherView ? "Anterior" : "Semana anterior"}
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">
              {isTeacherView ? "Anterior" : "Semana anterior"}
            </span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (isTeacherView) {
                focusTomorrow();
              } else {
                focusSpreadsheetDate(todayISO());
              }
            }}
          >
            <CalendarDays size={15} />
            {isTeacherView ? "Amanhã" : "Hoje"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => moveWeek(1)}
            aria-label="Próxima semana"
          >
            <span className="hidden sm:inline">Próxima semana</span>
            <ChevronRight size={16} />
          </Button>
          <label className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--foreground))]">
            Período
            <select
              aria-label="Filtrar planilha por período"
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
              className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-xs"
            >
              <option value="Todos">Manhã e tarde</option>
              <option value="Manhã">Manhã</option>
              <option value="Tarde">Tarde</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold capitalize text-[hsl(var(--foreground))]">
              {monthFormatter.format(weekStart)}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {formatWeekLabel(weekDates)}
            </p>
          </div>
          <input
            aria-label="Escolher semana pela data"
            type="date"
            value={formatDateKey(selectedDate)}
            onChange={(event) => {
              if (!event.target.value) return;
              setSelectedDate(
                getMondayOfWeek(new Date(`${event.target.value}T12:00:00`)),
              );
            }}
            className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
          />
        </div>
      </section>

      {!readOnly && <div
        role="tablist"
        aria-label="Modo de visualização da planilha"
        className="flex flex-wrap gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "quick"}
          onClick={() => selectSpreadsheetMode("quick")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
            mode === "quick"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
          }`}
        >
          <Table2 size={16} />
          Acesso Rápido
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "complete"}
          onClick={() => selectSpreadsheetMode("complete")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
            mode === "complete"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
          }`}
        >
          <List size={16} />
          Acesso Completo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "reserve"}
          onClick={() => selectSpreadsheetMode("reserve")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
            mode === "reserve"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
          }`}
        >
          <Laptop size={16} />
          Reserva
        </button>
      </div>}

      {!readOnly && <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <FileSpreadsheet size={15} />
        {mode === "quick"
          ? "Layout inspirado na planilha enviada; mostra carrinho, horário, turma, sala e professor."
          : mode === "complete"
            ? "Todos os campos disponíveis do agendamento e do acompanhamento do carrinho."
            : "Chromebooks separados para reserva e solicitações dos professores."}
      </div>}

      {readOnly && teacherReservationsLoading && !teacherReservationsLoaded ? (
        <p role="status" className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
          Carregando a visão rápida da planilha...
        </p>
      ) : readOnly && teacherReservationsError && !teacherReservationsLoaded ? (
        <p role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm text-[hsl(var(--destructive))]">
          {teacherReservationsError}
        </p>
      ) : (
      <>
      {readOnly && teacherReservationsError && (
        <p role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm text-[hsl(var(--destructive))]">
          Não foi possível atualizar a planilha. Os dados já carregados foram mantidos. {teacherReservationsError}
        </p>
      )}
      {readOnly && teacherProfileError && (
        <p role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm text-[hsl(var(--destructive))]">
          Não foi possível carregar seu perfil; por segurança, a reserva de horários está indisponível. {teacherProfileError}
        </p>
      )}
      {mode === "quick" ? (
        <QuickAccess
          dates={quickAccessDates}
          focusRequest={quickAccessFocus}
          cartNames={cartNames}
          reservations={visibleReservations}
          cartSchedules={cartSchedules}
          unavailableCartNames={carts.filter((cart: Cart) => cart.unavailable).map((cart: Cart) => cart.name)}
          allowCartATransitionScheduling={movementSettings.allowCartATransitionScheduling}
          onMoveReservation={moveReservation}
          onMoveReservations={moveReservationsToCart}
          onUndoReservations={moveReservationsToCart}
          periodFilter={periodFilter}
          readOnly={readOnly}
          canDirectBook={canDirectBook}
          canTeacherBook={canTeacherBook}
          currentTeacherName={currentTeacherName}
          campusSettings={campusSettings}
          teacherProfiles={teacherAccessAccounts}
          teacherProfilesError={teacherAccessAccountsError}
          teacherSegments={teacherSegments}
          teacherProfileClassName={teacherProfileClassName}
          onCreateReservation={createReservationFromSheet}
          onUpdateReservation={updateReservationFromSheet}
          onDeleteReservation={deleteReservationFromSheet}
          classOptions={classEntries}
          roomOptions={roomOptions}
          roomCatalogLoading={roomCatalogLoading}
          roomsSyncError={roomsSyncError}
        />
      ) : mode === "complete" ? (
        <CompleteAccess
          dates={weekDates}
          reservations={visibleReservations}
          movements={movements}
          cartName={selectedCompleteCart}
          onCartChange={selectCompleteCart}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={saveVisibleColumns}
          periodFilter={periodFilter}
        />
      ) : (
        <ReserveAccess
          dates={weekDates}
          reservations={visibleReservations}
          reserveUnits={reserveUnits}
          reserveStockCount={reserveStockCount}
          reserveAssignments={reserveAssignments}
          teacherNames={teacherAccounts.map((account) => account.name)}
          rememberedPeople={campusSettings.reserveResponsiblePeople ?? []}
          onUpdateReserveUnitAssignments={updateReserveUnitAssignments}
          onRememberResponsiblePerson={rememberReserveResponsiblePerson}
          periodFilter={periodFilter}
          canEdit={canDirectBook}
          onUpdateReservation={updateReservationFromSheet}
        />
      )}
      </>
      )}

      {!readOnly && floorSuggestions.length > 0 && (
        <section
          aria-label="Sugestões de otimização por piso"
          className="overflow-hidden rounded-2xl border border-[#c6d2df] bg-white shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-[#d8e0e8] bg-[#eef3f8] px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#dce7f3] text-[#345779]">
              <Lightbulb size={17} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#173252]">Otimização por piso</h2>
              <p className="text-xs text-[#5f6f82]">Sugestões para aulas futuras desta semana</p>
            </div>
          </div>
          <div className="divide-y divide-[#e0e5eb]">
            {floorSuggestions.slice(0, 5).map(({ current, previous, floor }) => (
              <div
                key={current.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#25364a]">
                    {current.date} · {current.start} · {current.room} ({floor})
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#68788b]">
                    {previous.cart} já estará no mesmo piso às {previous.start} em {previous.room}.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f6edda] px-3 py-1 text-[11px] font-bold text-[#765420]">
                  Sugestão: {previous.cart}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => moveWeek(-1)}>
          <ArrowLeft size={15} />
          {isTeacherView ? "Anterior" : "Semana anterior"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => moveWeek(1)}>
          Próxima semana
          <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
