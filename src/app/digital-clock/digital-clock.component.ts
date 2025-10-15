import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-digital-clock',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './digital-clock.component.html',
  styleUrl: './digital-clock.component.scss'
})
export class DigitalClockComponent implements OnInit, OnDestroy {
  timeString = signal('');
  dateString = signal('');
  private timerId: any;

  ngOnInit() {
    this.updateTime();
    this.timerId = setInterval(() => this.updateTime(), 1000);
  }

  ngOnDestroy() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
  }

  updateTime() {
    const time = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    this.timeString.set(time);

    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    this.dateString.set(date);
  }
}