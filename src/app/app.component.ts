import { CommonModule } from '@angular/common';
import { DigitalClockComponent } from './digital-clock/digital-clock.component';
import { ChangeDetectionStrategy, Component, computed, effect, signal, WritableSignal } from '@angular/core';

// --- LOCAL STORAGE KEYS ---
const LS_KEYS = {
  USER_ID: 'timeSyncUserId',
  USER_NAME: 'timeSyncUserName',
  EMPLOYEE_ID: 'timeSyncEmployeeId',
  TIME_ENTRIES: 'timeSyncEntries',
};

// --- APP INTERFACES ---

interface TimeEntry {
  id: string; // Used as unique identifier, locally generated
  date: string;
  employeeId: string; // This will hold the user-provided ID (e.g., SIPL6095)
  employeeName: string;
  shiftTime: string;
  startTime: string;
  endTime: string;
  totalTimeMs: number;
  totalTimeDisplay: string; // HH:mm:ss format
  taskDetails: string;
  projectName: string;
  clientName: string;
  createdAt: number; // Timestamp in milliseconds
}

interface CurrentTask {
  initialStartTime: Date | null;
  lastSegmentStartTime: Date | null;
  taskDetails: string;
  projectName: string;
  clientName: string;
  accumulatedTimeMs: number;
}

// Interface for the data used in the Edit Modal
interface EditFormData {
  shiftTime: string;
  taskDetails: string;
  projectName: string;
  clientName: string;
}

type TrackingStatus = 'Ready' | 'FirstEntryTracking' | 'ReadyForSecondEntry' | 'SecondEntryTracking';

// --- UTILITY FUNCTIONS ---

/** Formats a Date object into a readable time string (e.g., 10:30:45 AM). */
function formatTime(date: Date): string {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/** Formats milliseconds into HH:mm:ss display string. */
function msToDisplayTime(ms: number): string {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Gets the current date in YYYY-MM-DD format. */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// --- ANGULAR COMPONENT ---
@Component({
  selector: 'app-root',
  imports: [CommonModule, DigitalClockComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  title = 'OfficeTracker';
 // --- LOCAL STATE AND PERSISTENCE FLAG ---
  isStateLoaded = signal(false); 
  localUserId = signal('loading...'); 
  
  // --- USER-FACING DATA (Editable & Persistent) ---
  userName = signal('Employee Name Here');
  employeeIdDisplay = signal('SIPL6095'); 
  
  // --- MOCK APP DATA ---
  shiftTime = signal('11:00 AM - 08:00 PM');
  todayDate = signal(getTodayDate());

  // --- TRACKING STATE ---
  status = signal<TrackingStatus>('Ready');
  
  currentTask = signal<CurrentTask>({
    initialStartTime: null,
    lastSegmentStartTime: null,
    taskDetails: '',
    projectName: '',
    clientName: '',
    accumulatedTimeMs: 0,
  });

  currentSegmentElapsedMs = signal(0);
  timeEntries = signal<TimeEntry[]>([]);
  
  private timerInterval: any = null;

  // --- EDITING STATE (NEW) ---
  editingEntry = signal<TimeEntry | null>(null);
  editFormData = signal<EditFormData>({ 
    shiftTime: '',
    taskDetails: '',
    projectName: '',
    clientName: '',
  });
  copiedEntryId = signal<string | null>(null);
  copiedAll = signal(false);


  constructor() {
    this.initializeState();
  }

  // --- LOCAL STORAGE PERSISTENCE ---

  initializeState() {
    try {
      let userId = localStorage.getItem(LS_KEYS.USER_ID);
      if (!userId) {
        userId = crypto.randomUUID(); 
        localStorage.setItem(LS_KEYS.USER_ID, userId);
      }
      this.localUserId.set(userId);

      const savedName = localStorage.getItem(LS_KEYS.USER_NAME);
      if (savedName) {
        this.userName.set(savedName);
      }
      const savedId = localStorage.getItem(LS_KEYS.EMPLOYEE_ID);
      if (savedId) {
        this.employeeIdDisplay.set(savedId);
      }

      this.loadTimeEntries();
      
      const count = this.timeEntries().filter(e => e.date === getTodayDate()).length;
      if (count === 1) {
        this.status.set('ReadyForSecondEntry');
      } else {
        this.status.set('Ready');
      }

      this.isStateLoaded.set(true);
    } catch (error) {
      console.error("Error loading state from localStorage:", error);
      this.isStateLoaded.set(true);
    }
  }

  persistUserSettings() {
    try {
      localStorage.setItem(LS_KEYS.USER_NAME, this.userName());
      localStorage.setItem(LS_KEYS.EMPLOYEE_ID, this.employeeIdDisplay());
    } catch (error) {
      console.error("Error saving user settings to localStorage:", error);
    }
  }

  loadTimeEntries() {
    try {
      const json = localStorage.getItem(LS_KEYS.TIME_ENTRIES);
      if (json) {
        const loadedEntries: TimeEntry[] = JSON.parse(json);
        loadedEntries.sort((a, b) => b.createdAt - a.createdAt);
        this.timeEntries.set(loadedEntries);
      } else {
        this.timeEntries.set([]);
      }
    } catch (error) {
      console.error("Error loading time entries from localStorage:", error);
      this.timeEntries.set([]);
    }
  }

  saveTimeEntries() {
    try {
      const entries = this.timeEntries();
      entries.sort((a, b) => b.createdAt - a.createdAt);
      localStorage.setItem(LS_KEYS.TIME_ENTRIES, JSON.stringify(entries));
    } catch (error) {
      console.error("Error saving time entries to localStorage:", error);
    }
  }

  // --- INPUT HANDLERS for persistent data ---

  updateUserName(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.userName.set(value);
    this.persistUserSettings();
  }

  updateEmployeeIdDisplay(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.employeeIdDisplay.set(value);
    this.persistUserSettings();
  }


  // --- COMPUTED STATE (For Display and Control) ---
  
  totalTimeElapsed = computed(() => {
    return this.currentTask().accumulatedTimeMs + this.currentSegmentElapsedMs();
  });

  timerDisplay = computed(() => {
    return msToDisplayTime(this.totalTimeElapsed());
  });

  todayEntryCount = computed(() => {
    const today = getTodayDate();
    return this.timeEntries().filter(e => e.date === today).length;
  });

  isFormValid = computed(() => {
    const task = this.currentTask();
    return (
      task.taskDetails.trim().length > 0 &&
      task.projectName.trim().length > 0 &&
      task.clientName.trim().length > 0
    );
  });

  isStartAllowed = computed(() => {
    return this.isFormValid() && this.todayEntryCount() < 2;
  });

  // --- TRACKING LOGIC ---

  startTracking() {
    if (!this.isStartAllowed()) return;

    const now = new Date();
    this.status.set('FirstEntryTracking');
    this.currentSegmentElapsedMs.set(0);

    this.currentTask.update(task => ({
      ...task,
      initialStartTime: now,
      lastSegmentStartTime: now,
      accumulatedTimeMs: 0,
    }));

    this.startTimerInterval();
  }

  pauseTracking() {
    if (this.status() !== 'FirstEntryTracking') return;

    this.stopTimerInterval();

    let finalAccumulatedMs = this.currentTask().accumulatedTimeMs;
    if (this.currentTask().lastSegmentStartTime) {
      const segmentMs = new Date().getTime() - this.currentTask().lastSegmentStartTime!.getTime();
      finalAccumulatedMs += segmentMs;
    }

    const initialStartTime = this.currentTask().initialStartTime;
    const now = new Date();
    const newEntry: TimeEntry = {
      id: crypto.randomUUID(),
      date: getTodayDate(),
      employeeId: this.employeeIdDisplay(),
      employeeName: this.userName(),
      shiftTime: this.shiftTime(),
      startTime: formatTime(initialStartTime || now),
      endTime: formatTime(now),
      totalTimeMs: finalAccumulatedMs,
      totalTimeDisplay: msToDisplayTime(finalAccumulatedMs),
      taskDetails: this.currentTask().taskDetails,
      projectName: this.currentTask().projectName,
      clientName: this.currentTask().clientName,
      createdAt: now.getTime(),
    };

    this.timeEntries.update(entries => [newEntry, ...entries]);
    this.saveTimeEntries();

    this.resetTaskState();
    this.status.set('ReadyForSecondEntry');
  }

  resumeTracking() {
    if (this.status() !== 'ReadyForSecondEntry' || !this.isFormValid()) return;

    const now = new Date();
    this.status.set('SecondEntryTracking');
    this.currentSegmentElapsedMs.set(0);

    this.currentTask.update(task => ({
      ...task,
      initialStartTime: now,
      lastSegmentStartTime: now,
      accumulatedTimeMs: 0,
    }));

    this.startTimerInterval();
  }

  endTracking() {
    if (this.status() !== 'SecondEntryTracking') return;

    this.stopTimerInterval();

    let finalAccumulatedMs = this.currentTask().accumulatedTimeMs;
    if (this.currentTask().lastSegmentStartTime) {
      const segmentMs = new Date().getTime() - this.currentTask().lastSegmentStartTime!.getTime();
      finalAccumulatedMs += segmentMs;
    }

    const initialStartTime = this.currentTask().initialStartTime;
    const now = new Date();
    const newEntry: TimeEntry = {
      id: crypto.randomUUID(),
      date: getTodayDate(),
      employeeId: this.employeeIdDisplay(),
      employeeName: this.userName(),
      shiftTime: this.shiftTime(),
      startTime: formatTime(initialStartTime || now),
      endTime: formatTime(now),
      totalTimeMs: finalAccumulatedMs,
      totalTimeDisplay: msToDisplayTime(finalAccumulatedMs),
      taskDetails: this.currentTask().taskDetails,
      projectName: this.currentTask().projectName,
      clientName: this.currentTask().clientName,
      createdAt: now.getTime(),
    };

    this.timeEntries.update(entries => [newEntry, ...entries]);
    this.saveTimeEntries();

    this.resetTaskState();
    this.status.set('Ready');
  }

  // --- TIMER MANAGEMENT ---

  private startTimerInterval() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.timerInterval = setInterval(() => {
      this.currentSegmentElapsedMs.update(ms => ms + 1000);
    }, 1000);
  }

  private stopTimerInterval() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private resetTaskState() {
    this.currentTask.set({
      initialStartTime: null,
      lastSegmentStartTime: null,
      taskDetails: '',
      projectName: '',
      clientName: '',
      accumulatedTimeMs: 0,
    });
    this.currentSegmentElapsedMs.set(0);
  }
  
  // --- INPUT HANDLERS for current task form ---

  updateTaskField(field: keyof Omit<CurrentTask, 'initialStartTime' | 'lastSegmentStartTime' | 'accumulatedTimeMs'>, event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.currentTask.update(task => ({ ...task, [field]: value }));
  }

  // --- EDIT MODAL LOGIC (New/Modified) ---

  openEditModal(entry: TimeEntry) {
    this.editingEntry.set(entry);
    this.editFormData.set({
      shiftTime: entry.shiftTime,
      taskDetails: entry.taskDetails,
      projectName: entry.projectName,
      clientName: entry.clientName,
    });
  }

  closeEditModal() {
    this.editingEntry.set(null);
  }

  updateEditField(field: keyof EditFormData, event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.editFormData.update(data => ({ ...data, [field]: value }));
  }

  isEditFormValid = computed(() => {
    const data = this.editFormData();
    return (
      data.taskDetails.trim().length > 0 &&
      data.projectName.trim().length > 0 &&
      data.clientName.trim().length > 0 &&
      data.shiftTime.trim().length > 0
    );
  });
  
  saveEditedEntry() {
    if (!this.editingEntry() || !this.isEditFormValid()) return;
    
    const entryToUpdate = this.editingEntry()!;
    const formData = this.editFormData();

    const updatedEntry: TimeEntry = {
      ...entryToUpdate,
      shiftTime: formData.shiftTime,
      taskDetails: formData.taskDetails,
      projectName: formData.projectName,
      clientName: formData.clientName,
    };

    this.timeEntries.update(entries => 
      entries.map(e => e.id === updatedEntry.id ? updatedEntry : e)
    );

    this.saveTimeEntries();
    
    this.closeEditModal();
  }

  copyEntryToClipboard(entry: TimeEntry) {
    const entryText = [
      `Date: ${entry.date}`,
      `Employee ID: ${entry.employeeId}`,
      `Employee Name: ${entry.employeeName}`,
      `Shift Time: ${entry.shiftTime}`,
      `Start Time: ${entry.startTime}`,
      `End Time: ${entry.endTime}`,
      `Total Time: ${entry.totalTimeDisplay}`,
      `Project: ${entry.projectName}`,
      `Client: ${entry.clientName}`,
      `Task: ${entry.taskDetails}`
    ].join('\n');

    navigator.clipboard.writeText(entryText)
      .then(() => {
        this.copiedEntryId.set(entry.id);
        setTimeout(() => {
          if (this.copiedEntryId() === entry.id) {
            this.copiedEntryId.set(null);
          }
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy entry to clipboard:', err);
      });
  }

  copyAllEntriesToClipboard() {
    const today = getTodayDate();
    const todayEntries = this.timeEntries()
      .filter(e => e.date === today)
      .sort((a, b) => a.createdAt - b.createdAt); // Sort ascending for chronological order

    if (todayEntries.length === 0) return;

    const headers = [
      'Date', 'Employee ID', 'Employee Name', 'Shift Time', 'Start Time',
      'End Time', 'Total Time', 'Task Details', 'Project Name', 'Client Name'
    ];

    const headerRow = headers.join('\t');

    const dataRows = todayEntries.map(entry => {
      return [
        entry.date,
        entry.employeeId,
        entry.employeeName,
        entry.shiftTime,
        entry.startTime,
        entry.endTime,
        entry.totalTimeDisplay,
        entry.taskDetails.replace(/\t|\n|\r/g, ' '),
        entry.projectName.replace(/\t|\n|\r/g, ' '),
        entry.clientName.replace(/\t|\n|\r/g, ' ')
      ].join('\t');
    });

    const allEntriesText = [headerRow, ...dataRows].join('\n');

    navigator.clipboard.writeText(allEntriesText)
      .then(() => {
        this.copiedAll.set(true);
        setTimeout(() => {
          this.copiedAll.set(false);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy all entries to clipboard:', err);
      });
  }
}