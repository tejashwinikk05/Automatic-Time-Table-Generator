// ---------------- FINAL UPDATED JAVASCRIPT (paste as script.js) --------------------
(function () {
  const daysInput = document.getElementById("daysInput");
  const periodsInput = document.getElementById("periodsInput");
  const breakSlotInput = document.getElementById("breakSlot");
  const lunchSlotInput = document.getElementById("lunchSlot");
  const subjectsForm = document.getElementById("subjectsForm");
  const addSubjectBtn = document.getElementById("addSubject");
  const generateBtn = document.getElementById("generate");
  const applySettingsBtn = document.getElementById("applySettings");
  const messageEl = document.getElementById("message");
  const timetableContainer = document.getElementById("timetableContainer");
  const downloadPdfBtn = document.getElementById("downloadPdf");

  const defaultPeriodLabels = [
    "9:00 AM TO 10:00 AM",
    "10:00 AM TO 11:00 AM",
    "11:00 AM TO 11:15 AM",
    "11:15 AM TO 12:15 PM",
    "12:15 PM TO 1:15 PM",
    "1:15 PM TO 2:00 PM",
    "2:00 PM TO 3:00 PM",
    "3:00 PM TO 4:00 PM",
    "4:00 PM TO 5:00 PM",
  ];

  const MAX_HOURS_PER_SUBJECT = 4;

  function escapeHtml(s) {
    return (s || "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function createSubjectRow(name = "", hours = 1, teacher = "") {
    const div = document.createElement("div");
    div.className = "subject-row";
    div.innerHTML = `
      <input class="subName" placeholder="Subject name" value="${escapeHtml(name)}" />
      <input class="subHours" type="number" min="1" max="${MAX_HOURS_PER_SUBJECT}" value="${hours}" />
      <input class="subTeacher" placeholder="Teacher name" value="${escapeHtml(teacher)}" />
      <button class="removeBtn">X</button>
      <span class="warning" style="display:none;color:red;margin-left:8px">Hour should not exceed ${MAX_HOURS_PER_SUBJECT} Class</span>
    `;

    const removeBtn = div.querySelector(".removeBtn");
    const hoursInput = div.querySelector(".subHours");
    const warn = div.querySelector(".warning");

    removeBtn.addEventListener("click", () => div.remove());

    hoursInput.addEventListener("input", () => {
      let v = parseInt(hoursInput.value, 10) || 0;
      if (v > MAX_HOURS_PER_SUBJECT) {
        warn.style.display = "inline";
        hoursInput.value = MAX_HOURS_PER_SUBJECT;
      } else {
        warn.style.display = "none";
      }
    });

    return div;
  }

  // UI actions
  addSubjectBtn.addEventListener("click", () => subjectsForm.appendChild(createSubjectRow()));
  applySettingsBtn.addEventListener("click", () => {
    messageEl.textContent = "Settings applied.";
    messageEl.classList.remove("error");
  });

  function readSubjects() {
    const rows = Array.from(subjectsForm.querySelectorAll(".subject-row"));
    const warnings = [];
    const subjects = rows.map((r) => {
      const name = r.querySelector(".subName").value.trim();
      const rawHours = parseInt(r.querySelector(".subHours").value, 10) || 0;
      const teacher = r.querySelector(".subTeacher").value.trim();
      const hours = Math.max(0, Math.min(MAX_HOURS_PER_SUBJECT, rawHours));
      if (rawHours > MAX_HOURS_PER_SUBJECT) warnings.push(`${name || "(unnamed)"}: ${rawHours} → ${hours}`);
      return { name, hours, teacher, originalHours: rawHours };
    }).filter(s => s.name && s.hours > 0);
    return { subjects, warnings };
  }

  function buildEmptySchedule(days, periods, breakIdx, lunchIdx) {
    // returns schedule[dayIndex][periodIndex] = { type: 'period'|'break'|'lunch'|'lab', subject: null | 'Free' | 'SUB', teacher: '' }
    return days.map(() => Array.from({ length: periods }).map(() => ({ type: "period", subject: null, teacher: "" })))
      .map((row, di) => row.map((cell, pi) => {
        if (pi === breakIdx) return { type: "break" };
        if (pi === lunchIdx) return { type: "lunch" };
        return { type: "period", subject: null, teacher: "" };
      }));
  }

  // Decide and reserve lab pair positions BEFORE scheduling (so subject scheduling won't put subjects there).
  function decideAndReserveLabs(schedule, days, periods, breakIdx, lunchIdx) {
    if (!window._labs || window._labs.length < 2) return null;

    function parseLabString(s) {
      const m = /^(.+?)\s*\(\s*([^)]+)\s*\)\s*$/.exec(s);
      if (m) return { name: m[1].trim(), batch: m[2].trim() };
      return { name: s.trim(), batch: "" };
    }

    const labA = parseLabString(window._labs[0]);
    const labB = parseLabString(window._labs[1]);

    const combined1 = `${labA.name} (${labA.batch})  ${labB.name} (${labB.batch})`;
    const combined2 = `${labA.name} (${labB.batch})  ${labB.name} (${labA.batch})`;

    const validPairs = [];

    for (let d = 0; d < days.length; d++) {
      // we avoid Saturday for labs (as requested)
      if (days[d].toLowerCase() === "saturday") continue;
      for (let p = 0; p < periods - 1; p++) {
        // avoid break/lunch times
        if (p === breakIdx || p + 1 === breakIdx) continue;
        if (p === lunchIdx || p + 1 === lunchIdx) continue;
        // avoid saturday after lunch restriction (already excluded)
        // both must be period
        if (!schedule[d][p] || !schedule[d][p + 1]) continue;
        if (schedule[d][p].type !== "period" || schedule[d][p + 1].type !== "period") continue;
        validPairs.push({ d, p });
      }
    }

    if (validPairs.length === 0) return null;

    shuffleArray(validPairs);

    // choose first two non-overlapping pairs (prefer different days)
    let first = validPairs[0];
    let second = validPairs.find(v => !(v.d === first.d && Math.abs(v.p - first.p) < 2));
    if (!second) {
      // fallback: pick next pair (possibly same day but not overlapping)
      for (let i = 1; i < validPairs.length; i++) {
        const cand = validPairs[i];
        if (!(cand.d === first.d && Math.abs(cand.p - first.p) < 2)) { second = cand; break; }
      }
    }
    if (!second) {
      // cannot find second non-overlapping pair -> return only one lab block
      // We'll still reserve first
    }

    // Reserve - mark schedule slots as type 'lab' and attach placeholder ids
    schedule[first.d][first.p] = { type: "lab", subject: "__LAB1__", teacher: "" };
    schedule[first.d][first.p + 1] = { type: "lab", subject: "__LAB1__", teacher: "" };

    if (second) {
      schedule[second.d][second.p] = { type: "lab", subject: "__LAB2__", teacher: "" };
      schedule[second.d][second.p + 1] = { type: "lab", subject: "__LAB2__", teacher: "" };
    }

    return { first, second, combined1, combined2 };
  }

  // Scheduler: allocate exact-hours subject units to available period slots (skipping break/lunch/lab and saturday-after-lunch)
  // Option B: if a subject must repeat on a day because not enough distinct days, allow repeats (but only when necessary).
  function scheduleSubjects(daysArr, periods, breakIdx, lunchIdx, subjects, reservedLabInfo) {
    const days = daysArr.slice();
    const schedule = buildEmptySchedule(days, periods, breakIdx, lunchIdx);

    // Re-apply reserved labs into the new schedule (so scheduling treats lab cells as unavailable)
    if (reservedLabInfo) {
      const { first, second } = reservedLabInfo;
      if (first) {
        schedule[first.d][first.p] = { type: "lab", subject: "__LAB1__", teacher: "" };
        schedule[first.d][first.p + 1] = { type: "lab", subject: "__LAB1__", teacher: "" };
      }
      if (second) {
        schedule[second.d][second.p] = { type: "lab", subject: "__LAB2__", teacher: "" };
        schedule[second.d][second.p + 1] = { type: "lab", subject: "__LAB2__", teacher: "" };
      }
    }

    // SATURDAY: after lunch -> blank cells (keep them as period type but set subject blank) — but we will treat them as unavailable for placement
    const satIndex = days.findIndex(d => d.toLowerCase() === "saturday");
    function isSatAfterLunch(d, p) {
      return (d === satIndex) && (p > lunchIdx);
    }

    // Build list of usable slots (d,p)
    const usableSlots = [];
    for (let d = 0; d < days.length; d++) {
      for (let p = 0; p < periods; p++) {
        const cell = schedule[d][p];
        if (!cell) continue;
        if (cell.type !== "period") continue; // skip break/lunch/lab already
        if (isSatAfterLunch(d, p)) continue;
        usableSlots.push({ d, p });
      }
    }

    // Build pool units equal to specified hours
    let poolUnits = [];
    const teacherMap = {};
    subjects.forEach(s => {
      teacherMap[s.name] = s.teacher || "";
      for (let i = 0; i < s.hours; i++) poolUnits.push({ name: s.name, teacher: s.teacher || "" });
    });

    if (poolUnits.length > usableSlots.length) {
      throw new Error(`Not enough available slots. Required ${poolUnits.length}, available ${usableSlots.length}. Reduce hours or increase periods/days.`);
    }

    // We'll aim to:
    // 1) Make first period (canonicalFirst) unique as much as possible
    // 2) Place remaining units trying to avoid same-subject within same day where possible
    // 3) If impossible (Option B), allow repeats to place all units.

    // Determine canonical first index (prefer 0 but skip if break/lunch/lab)
    let canonicalFirst = 0;
    if (!schedule[0][0] || schedule[0][0].type !== "period") {
      for (let p = 0; p < periods; p++) {
        if (schedule[0][p] && schedule[0][p].type === "period") { canonicalFirst = p; break; }
      }
    }

    // Collect days where canonicalFirst is usable
    const firstValidDays = [];
    for (let d = 0; d < days.length; d++) {
      if (schedule[d][canonicalFirst] && schedule[d][canonicalFirst].type === "period" && !isSatAfterLunch(d, canonicalFirst)) {
        firstValidDays.push(d);
      }
    }

    const subjectNames = subjects.map(s => s.name);
    // Shuffle subject list to randomize assignment
    const shuffledSubjectNames = shuffleArray(subjectNames.slice());

    // Track used subjects per day
    const usedInDay = Array.from({ length: days.length }, () => new Set());

    // Convert usableSlots to mutable list
    let freeSlots = usableSlots.slice();
    shuffleArray(freeSlots);

    // Assign first-period unique subjects as much as possible
    if (shuffledSubjectNames.length >= firstValidDays.length) {
      // we have >= subjects than days - choose unique for each day
      for (let i = 0; i < firstValidDays.length; i++) {
        const d = firstValidDays[i];
        const subj = shuffledSubjectNames[i % shuffledSubjectNames.length];
        if (!schedule[d][canonicalFirst] || schedule[d][canonicalFirst].type !== "period") continue;
        schedule[d][canonicalFirst].subject = subj;
        schedule[d][canonicalFirst].teacher = teacherMap[subj] || "";
        usedInDay[d].add(subj);
        // remove one unit for that subject from poolUnits
        const idx = poolUnits.findIndex(u => u.name === subj);
        if (idx !== -1) poolUnits.splice(idx, 1);
        // remove the assigned slot from freeSlots
        freeSlots = freeSlots.filter(s => !(s.d === d && s.p === canonicalFirst));
      }
    } else {
      // subjects < days, assign each subject once first until exhausted, remaining days get random subject (but avoid immediate repeats)
      let idx = 0;
      for (const subj of shuffledSubjectNames) {
        if (idx >= firstValidDays.length) break;
        const d = firstValidDays[idx++];
        if (!schedule[d][canonicalFirst] || schedule[d][canonicalFirst].type !== "period") continue;
        schedule[d][canonicalFirst].subject = subj;
        schedule[d][canonicalFirst].teacher = teacherMap[subj] || "";
        usedInDay[d].add(subj);
        const pidx = poolUnits.findIndex(u => u.name === subj);
        if (pidx !== -1) poolUnits.splice(pidx, 1);
        freeSlots = freeSlots.filter(s => !(s.d === d && s.p === canonicalFirst));
      }
      // remaining days
      while (idx < firstValidDays.length) {
        const d = firstValidDays[idx++];
        // choose random subject
        const subj = subjectNames[Math.floor(Math.random() * subjectNames.length)];
        if (!schedule[d][canonicalFirst] || schedule[d][canonicalFirst].type !== "period") continue;
        schedule[d][canonicalFirst].subject = subj;
        schedule[d][canonicalFirst].teacher = teacherMap[subj] || "";
        usedInDay[d].add(subj);
        const pidx = poolUnits.findIndex(u => u.name === subj);
        if (pidx !== -1) poolUnits.splice(pidx, 1);
        freeSlots = freeSlots.filter(s => !(s.d === d && s.p === canonicalFirst));
      }
    }

    // Shuffle poolUnits and freeSlots for randomness
    shuffleArray(poolUnits);
    shuffleArray(freeSlots);

    // Helper: find a free slot index where subject is not already used that day
    function findSlotIndexAvoidingDayRepeat(subj) {
      for (let i = 0; i < freeSlots.length; i++) {
        const s = freeSlots[i];
        if (!usedInDay[s.d].has(subj)) return i;
      }
      return -1;
    }

    // Now place remaining units
    while (poolUnits.length) {
      const unit = poolUnits.pop();
      // try to place in slot where that subject not used in that day
      let slotIdx = findSlotIndexAvoidingDayRepeat(unit.name);
      if (slotIdx === -1) {
        // Option B: allow repeats when necessary -> pick first available slot
        if (freeSlots.length === 0) {
          // no slots left (shouldn't happen because we checked earlier)
          break;
        }
        slotIdx = 0;
      }
      const picked = freeSlots.splice(slotIdx, 1)[0];
      schedule[picked.d][picked.p].subject = unit.name;
      schedule[picked.d][picked.p].teacher = unit.teacher || teacherMap[unit.name] || "";
      usedInDay[picked.d].add(unit.name);
    }

    // Finally fill remaining period slots as "Free" (but keep lab/break/lunch as is)
    for (let d = 0; d < days.length; d++) {
      for (let p = 0; p < periods; p++) {
        const cell = schedule[d][p];
        if (!cell) continue;
        if (cell.type === "period") {
          if (cell.subject === null || cell.subject === undefined) {
            // if saturday after lunch -> keep blank (user wanted saturday after lunch blank)
            if (isSatAfterLunch(d, p)) {
              schedule[d][p].subject = "";
              schedule[d][p].teacher = "";
            } else {
              schedule[d][p].subject = "Free";
              schedule[d][p].teacher = "";
            }
          }
        } else {
          // leave break/lunch/lab as they are (lab placeholders will be replaced in DOM merge)
        }
      }
    }

    return schedule;
  }

  // Render timetable
  function renderTimetable(daysArr, periods, breakIdx, lunchIdx, schedule, periodLabels) {
    timetableContainer.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "table";
    const table = document.createElement("table");

    // Header
    const thead = document.createElement("thead");
    const trH = document.createElement("tr");
    trH.appendChild(document.createElement("th")); // corner
    for (let p = 0; p < periods; p++) {
      const th = document.createElement("th");
      th.textContent = (periodLabels && periodLabels[p]) ? periodLabels[p] : `Period ${p + 1}`;
      trH.appendChild(th);
    }
    thead.appendChild(trH);
    table.appendChild(thead);

    // Body rows (one per day)
    const tbody = document.createElement("tbody");

    for (let d = 0; d < daysArr.length; d++) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = daysArr[d];
      tr.appendChild(th);

      for (let p = 0; p < periods; p++) {
        const cell = schedule[d][p];

        if (!cell) {
          const td = document.createElement("td");
          td.innerHTML = `<div class="subject-card"></div>`;
          tr.appendChild(td);
          continue;
        }

        if (cell.type === "break" || cell.type === "lunch") {
          if (d === 0) {
            const td = document.createElement("td");
            td.setAttribute("rowspan", daysArr.length.toString());
            td.style.textAlign = "center";
            td.style.verticalAlign = "middle";
            td.innerHTML = `<strong>${cell.type === "break" ? "Break" : "Lunch"}</strong>`;
            tr.appendChild(td);
          } else {
            // covered by rowspan of first row
          }
        } else if (cell.type === "lab") {
          // We'll render the placeholder text here (merged by DOM post-process)
          const td = document.createElement("td");
          const subjText = (cell.subject === "__LAB1__" || cell.subject === "__LAB2__") ? cell.subject : escapeHtml(cell.subject || "");
          td.innerHTML = `<div class="subject-card">${escapeHtml(subjText)}${cell.teacher ? `<div style="font-size:12px;color:#333;margin-top:4px">${escapeHtml(cell.teacher)}</div>` : ""}</div>`;
          tr.appendChild(td);
        } else { // period
          const td = document.createElement("td");
          const subj = cell.subject === null ? "" : cell.subject;
          const teacher = cell.teacher ? `<div style="font-size:12px;color:#333;margin-top:4px">${escapeHtml(cell.teacher)}</div>` : "";
          // saturday after lunch blank: shown as empty card
          const satIndex = daysArr.findIndex(dd => dd.toLowerCase() === "saturday");
          if (d === satIndex && p > lunchIdx) {
            td.innerHTML = `<div class="subject-card"></div>`;
          } else {
            td.innerHTML = `<div class="subject-card">${escapeHtml(subj)}${subj && subj !== "Free" ? teacher : ""}</div>`;
          }
          tr.appendChild(td);
        }
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    timetableContainer.appendChild(wrapper);
  }

  // After the DOM is rendered, merge two TDs for each lab pair and set combined lab text
  function applyLabMerges(reservedInfo) {
    if (!reservedInfo) return;

    const { first, second, combined1, combined2 } = reservedInfo;
    const tbodyRows = document.querySelectorAll('#timetableContainer table tbody tr');
    if (!tbodyRows || tbodyRows.length === 0) return;

    const breakIdx = parseInt(breakSlotInput.value, 10);
    const lunchIdx = parseInt(lunchSlotInput.value, 10);
    const headerThs = document.querySelectorAll('#timetableContainer table thead tr th');
    const periodsCount = Math.max(headerThs.length - 1, 0);

    function mergeFor(target, text) {
      if (!target) return;
      const { d, p } = target;
      if (d < 0 || d >= tbodyRows.length) return;
      const row = tbodyRows[d];
      const tds = Array.from(row.querySelectorAll('td'));
      // build period -> td map (account for break/lunch columns which use rowspan)
      let periodToTd = [];
      let tdPtr = 0;
      for (let idx = 0; idx < periodsCount; idx++) {
        if (idx === breakIdx || idx === lunchIdx) {
          periodToTd.push(null);
        } else {
          periodToTd.push(tds[tdPtr] || null);
          tdPtr++;
        }
      }
      const td1 = periodToTd[p];
      const td2 = periodToTd[p + 1];
      if (!td1 || !td2) return;
      td1.setAttribute('colspan', '2');
      td1.innerHTML = `<div class="subject-card">${escapeHtml(text)}</div>`;
      try { td2.remove(); } catch (e) { /* ignore */ }
    }

    mergeFor(first, combined1);
    mergeFor(second, combined2);
  }

  // LAB input UI
  const labName = document.getElementById("labName");
  const labSection = document.getElementById("labSection");
  const labBatch = document.getElementById("labBatch");
  const labList = document.getElementById("labList");
  const addLabBtn = document.getElementById("addLabBtn");

  const batchMap = { A: ["A1", "A2"], B: ["B1", "B2"], C: ["C1", "C2"] };

  function updateBatch() {
    labBatch.innerHTML = "";
    (batchMap[labSection.value] || []).forEach(b => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      labBatch.appendChild(opt);
    });
  }
  updateBatch();
  labSection.addEventListener("change", updateBatch);

  addLabBtn.addEventListener("click", () => {
    const item = `${labName.value} (${labBatch.value})`;
    window._labs = window._labs || [];
    window._labs.push(item);
    const li = document.createElement("li");
    li.textContent = item;
    labList.appendChild(li);
  });

  // Generate flow
  generateBtn.addEventListener("click", () => {
    messageEl.textContent = "";
    messageEl.classList.remove("error");
    timetableContainer.innerHTML = "";

    try {
      const days = daysInput.value.split(',').map(s => s.trim()).filter(Boolean);
      const periods = Math.max(1, parseInt(periodsInput.value, 10) || 1);
      const breakIdx = parseInt(breakSlotInput.value, 10);
      const lunchIdx = parseInt(lunchSlotInput.value, 10);

      const { subjects, warnings } = readSubjects();
      if (!subjects.length) throw new Error("Add at least one subject.");

      // quick validation: total declared hours should not exceed available slots (excluding break/lunch and saturday-after-lunch and lab slots)
      // But lab slots are reserved next step; so first reserve labs, then schedule and check.

      // 1) build a base schedule and reserve labs (so scheduling will avoid lab slots)
      const baseSchedule = buildEmptySchedule(days, periods, breakIdx, lunchIdx);
      const reservedLabs = decideAndReserveLabs(baseSchedule, days, periods, breakIdx, lunchIdx);

      // 2) schedule with reserved lab slots taken into account
      const schedule = scheduleSubjects(days, periods, breakIdx, lunchIdx, subjects, reservedLabs);

      // 3) render
      const periodLabels = defaultPeriodLabels.slice(0, periods);
      renderTimetable(days, periods, breakIdx, lunchIdx, schedule, periodLabels);

      // 4) merge lab cells and set combined text
      applyLabMerges(reservedLabs);

      // save last
      window._lastSchedule = { days, periods, breakIdx, lunchIdx, schedule, subjects, periodLabels, reservedLabs };

      messageEl.textContent = "Timetable generated successfully.";
      if (warnings && warnings.length) messageEl.textContent += " Note: " + warnings.join("; ");
    } catch (err) {
      messageEl.textContent = "Error: " + err.message;
      messageEl.classList.add("error");
    }
  });

  // PDF download (clean print view)
  downloadPdfBtn.addEventListener("click", () => {
    const el = document.querySelector("#timetableContainer");
    if (!el || !el.innerHTML.trim()) { alert("Generate timetable first"); return; }
    const w = window.open("", "_blank", "noopener,width=1200,height=900");
    const styles = `
      <style>
        body{font-family:Segoe UI,Arial;margin:18px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #888;padding:8px;vertical-align:top}
        th{background:#f0f4f8;color:#111}
        .subject-card{padding:6px;border-radius:6px;background:#f7fbff;display:inline-block}
      </style>
    `;
    w.document.write(`<html><head><title>Timetable</title>${styles}</head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  });

  // default subjects (unchanged)
  subjectsForm.appendChild(createSubjectRow('Math', 4, 'Mr. Rao'));
  subjectsForm.appendChild(createSubjectRow('Science', 4, 'Ms. Iyer'));
  subjectsForm.appendChild(createSubjectRow('English', 4, 'Mrs. Patel'));
  subjectsForm.appendChild(createSubjectRow('History', 3, 'Mr. Khan'));
  subjectsForm.appendChild(createSubjectRow('Computer', 4, 'Ms. Das'));

})();
