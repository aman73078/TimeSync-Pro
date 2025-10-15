import { Component, OnInit, OnDestroy, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-analog-clock',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analog-clock.component.html',
  styleUrl: './analog-clock.component.scss'
})
export class AnalogClockComponent implements OnInit, OnDestroy {
  hourHandRotation = signal(0);
  minuteHandRotation = signal(0);
  secondHandRotation = signal(0);

  private timerId: any;

  ngOnInit() {
    this.updateClock();
    this.timerId = setInterval(() => this.updateClock(), 1000);
  }

  ngOnDestroy() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
  }

  updateClock() {
    const now = new Date();
    const seconds = now.getSeconds();
    const minutes = now.getMinutes();
    const hours = now.getHours();

    const secondDeg = seconds * 6;
    const minuteDeg = minutes * 6 + seconds * 0.1; 
    const hourDeg = (hours % 12) * 30 + minutes * 0.5;

    this.hourHandRotation.set(hourDeg);
    this.minuteHandRotation.set(minuteDeg);
    this.secondHandRotation.set(secondDeg);
  }
}