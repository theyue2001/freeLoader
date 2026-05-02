const DEFAULTS = {
  salary: "",
  workDays: 22,
  workHours: 8,
  startTime: "09:00",
  endTime: "18:00"
};

const fields = {
  salary: document.querySelector("#salary"),
  workDays: document.querySelector("#workDays"),
  workHours: document.querySelector("#workHours"),
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime")
};

const output = {
  clock: document.querySelector("#clock"),
  earnedToday: document.querySelector("#earnedToday"),
  earnedThisMonth: document.querySelector("#earnedThisMonth"),
  hourlyWage: document.querySelector("#hourlyWage"),
  minuteWage: document.querySelector("#minuteWage"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  quip: document.querySelector("#quip"),
  status: document.querySelector("#status")
};

const storage = globalThis.chrome?.storage?.local;
let settings = { ...DEFAULTS };
let timerId = null;

init();

async function init() {
  settings = await loadSettings();
  applySettingsToForm(settings);
  bindEvents();
  updateDashboard();
  timerId = setInterval(updateDashboard, 1000);
}

function bindEvents() {
  Object.entries(fields).forEach(([key, input]) => {
    input.addEventListener("input", () => {
      const value = normalizeInputValue(key, input.value);
      settings = { ...settings, [key]: value };
      saveSettings({ [key]: value });
      updateDashboard();
    });
  });

  window.addEventListener("unload", () => {
    if (timerId) {
      clearInterval(timerId);
    }
  });
}

function loadSettings() {
  return new Promise((resolve) => {
    if (!storage) {
      const fallback = JSON.parse(localStorage.getItem("salaryThiefSettings") || "{}");
      resolve({ ...DEFAULTS, ...fallback });
      return;
    }

    storage.get(DEFAULTS, (items) => resolve({ ...DEFAULTS, ...items }));
  });
}

function saveSettings(patch) {
  if (!storage) {
    localStorage.setItem(
      "salaryThiefSettings",
      JSON.stringify({ ...settings, ...patch })
    );
    return;
  }

  storage.set(patch);
}

function applySettingsToForm(nextSettings) {
  fields.salary.value = nextSettings.salary ?? "";
  fields.workDays.value = nextSettings.workDays;
  fields.workHours.value = nextSettings.workHours;
  fields.startTime.value = nextSettings.startTime;
  fields.endTime.value = nextSettings.endTime;
}

function normalizeInputValue(key, value) {
  if (key === "salary") {
    return value === "" ? "" : Math.max(0, Number(value));
  }

  if (key === "workDays") {
    return clamp(Number(value) || DEFAULTS.workDays, 1, 31);
  }

  if (key === "workHours") {
    return clamp(Number(value) || DEFAULTS.workHours, 0.5, 24);
  }

  return value || DEFAULTS[key];
}

function updateDashboard() {
  const now = new Date();
  const salary = Number(settings.salary) || 0;
  const workDays = Number(settings.workDays) || DEFAULTS.workDays;
  const workHours = Number(settings.workHours) || DEFAULTS.workHours;
  const dailyWage = salary / workDays;
  const hourlyWage = dailyWage / workHours;
  const minuteWage = hourlyWage / 60;
  const workday = getWorkdayState(now, settings.startTime, settings.endTime, workHours);
  const earnedToday = hourlyWage * workday.paidElapsedHours;
  const completedWorkdays = countCompletedWeekdaysThisMonth(now);
  const earnedThisMonth = completedWorkdays * dailyWage + earnedToday;

  output.clock.textContent = formatClock(now);
  output.hourlyWage.textContent = formatMoney(hourlyWage, 2);
  output.minuteWage.textContent = formatMoney(minuteWage, 3);
  output.earnedToday.textContent = formatMoney(earnedToday, 0);
  output.earnedThisMonth.textContent = formatMoney(earnedThisMonth, 0);
  output.progressText.textContent = `${Math.round(workday.progress * 100)}%`;
  output.progressBar.style.width = `${workday.progress * 100}%`;

  output.quip.textContent = getQuip(salary, earnedToday, workday);
  output.status.textContent = getStatusText(salary, workday);
}

function getWorkdayState(now, startTime, endTime, workHours) {
  const start = dateFromTime(now, startTime);
  const end = dateFromTime(now, endTime);
  const isWeekendDay = isWeekend(now);

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  const paidWorkMs = workHours * 60 * 60 * 1000;
  const elapsedMs = isWeekendDay
    ? 0
    : clamp(now - start, 0, Math.min(end - start, paidWorkMs));
  const progress = paidWorkMs > 0 ? clamp(elapsedMs / paidWorkMs, 0, 1) : 0;

  return {
    start,
    end,
    paidElapsedHours: elapsedMs / 1000 / 60 / 60,
    progress,
    isWeekend: isWeekendDay,
    isBeforeWork: now < start,
    isAfterWork: now >= end,
    isPaidDone: progress >= 1
  };
}

function countCompletedWeekdaysThisMonth(now) {
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let completedDays = 0;

  while (cursor < today) {
    if (!isWeekend(cursor)) {
      completedDays += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return completedDays;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dateFromTime(baseDate, timeString) {
  const [hours, minutes] = String(timeString || "00:00")
    .split(":")
    .map((part) => Number(part));
  const date = new Date(baseDate);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function getQuip(salary, earnedToday, workday) {
  if (!salary) {
    return "輸入月薪後，偷薪儀表板就會開始轉動。";
  }

  if (workday.isWeekend) {
    return "今天是週末，偷薪儀表板自動休眠。";
  }

  if (workday.isBeforeWork) {
    return "還沒上班，今天的偷薪任務正在暖機。";
  }

  if (workday.isAfterWork) {
    return `今日結算：你已經默默賺了公司 ${formatMoney(earnedToday, 0)}。`;
  }

  if (workday.isPaidDone) {
    return `你已經默默賺了公司 ${formatMoney(earnedToday, 0)}，接下來都是意志力。`;
  }

  return `你已經默默賺了公司 ${formatMoney(earnedToday, 0)}。`;
}

function getStatusText(salary, workday) {
  if (!salary) {
    return "尚未輸入月薪，今天先當精神股東。";
  }

  if (workday.isWeekend) {
    return "週末不列入工作日，本月累積只計算平日。";
  }

  if (workday.isBeforeWork) {
    return `距離上班還有 ${formatDuration(workday.start - new Date())}。`;
  }

  if (workday.isAfterWork) {
    return "下班了，今天的公司貢獻度已成功反向量化。";
  }

  if (workday.isPaidDone) {
    return `工時已滿，距離正式下班還有 ${formatDuration(workday.end - new Date())}。`;
  }

  return `距離薪水小偷完全體還有 ${Math.round((1 - workday.progress) * 100)}%。`;
}

function formatMoney(value, maximumFractionDigits) {
  const amount = Number.isFinite(value) ? value : 0;
  const formatter = new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });

  return `NT$${formatter.format(amount)}`;
}

function formatClock(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 1000 / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} 分鐘`;
  }

  if (minutes === 0) {
    return `${hours} 小時`;
  }

  return `${hours} 小時 ${minutes} 分鐘`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
