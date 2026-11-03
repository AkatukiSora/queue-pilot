const fixedTime = Date.parse('2026-11-03T06:00:00.000Z');
const NativeDate = globalThis.Date;

class E2EClockDate extends NativeDate {
  constructor(...args) {
    if (args.length === 0) {
      super(fixedTime);
      return;
    }
    super(...args);
  }

  static now() {
    return fixedTime;
  }
}

globalThis.Date = E2EClockDate;
