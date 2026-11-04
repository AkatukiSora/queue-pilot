const fixedTime = Date.parse(process.env.E2E_FIXED_TIME);
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
