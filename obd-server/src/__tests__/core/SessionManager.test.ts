import { SessionManager } from '../../core/SessionManager';

describe('SessionManager', () => {
    let sm: SessionManager;

    beforeEach(() => {
        sm = new SessionManager();
    });

    // ─── updateSession ────────────────────────────────────────────────────────
    describe('updateSession', () => {
        it('should create a new session on first call', () => {
            sm.updateSession('device1', '192.168.1.1');
            const session = sm.getSession('device1');
            expect(session).toBeDefined();
            expect(session?.deviceId).toBe('device1');
            expect(session?.ipAddress).toBe('192.168.1.1');
        });

        it('should initialise lastRpm and lastVoltage to 0', () => {
            sm.updateSession('device1', '192.168.1.1');
            const session = sm.getSession('device1');
            expect(session?.lastRpm).toBe(0);
            expect(session?.lastVoltage).toBe(0);
        });

        it('should update lastSeen and ipAddress on subsequent calls', () => {
            sm.updateSession('device1', '192.168.1.1');
            const firstSeen = sm.getSession('device1')!.lastSeen;

            // Small pause to guarantee different timestamp
            jest.useFakeTimers();
            jest.advanceTimersByTime(1000);
            sm.updateSession('device1', '10.0.0.1');
            jest.useRealTimers();

            const session = sm.getSession('device1')!;
            expect(session.ipAddress).toBe('10.0.0.1');
            expect(session.lastSeen).toBeGreaterThanOrEqual(firstSeen);
        });

        it('should NOT reset connectedAt on subsequent calls', () => {
            sm.updateSession('device1', '192.168.1.1');
            const originalConnectedAt = sm.getSession('device1')!.connectedAt;
            sm.updateSession('device1', '10.0.0.1');
            expect(sm.getSession('device1')!.connectedAt).toBe(originalConnectedAt);
        });
    });

    // ─── getAllSessions ───────────────────────────────────────────────────────
    describe('getAllSessions', () => {
        it('should return empty array when no sessions registered', () => {
            expect(sm.getAllSessions()).toEqual([]);
        });

        it('should return all registered sessions', () => {
            sm.updateSession('dev1', '1.1.1.1');
            sm.updateSession('dev2', '2.2.2.2');
            const all = sm.getAllSessions();
            expect(all).toHaveLength(2);
            const ids = all.map(s => s.deviceId);
            expect(ids).toContain('dev1');
            expect(ids).toContain('dev2');
        });
    });

    // ─── getSession ───────────────────────────────────────────────────────────
    describe('getSession', () => {
        it('should return undefined for unknown device', () => {
            expect(sm.getSession('unknown')).toBeUndefined();
        });

        it('should return the correct session for a known device', () => {
            sm.updateSession('dev1', '1.1.1.1');
            const s = sm.getSession('dev1');
            expect(s?.deviceId).toBe('dev1');
        });
    });

    // ─── processTelemetry ─────────────────────────────────────────────────────
    describe('processTelemetry', () => {
        beforeEach(() => {
            sm.updateSession('dev1', '1.1.1.1');
        });

        it('should update lastRpm on the session', () => {
            sm.processTelemetry('dev1', 60, { '0003': 1500 });
            expect(sm.getSession('dev1')!.lastRpm).toBe(1500);
        });

        it('should update lastVoltage on the session (divided by 1000)', () => {
            sm.processTelemetry('dev1', 60, { '0004': 14500 });
            expect(sm.getSession('dev1')!.lastVoltage).toBeCloseTo(14.5, 2);
        });

        it('should default rpm and voltage to 0 when pids are missing', () => {
            sm.processTelemetry('dev1', 0, {});
            expect(sm.getSession('dev1')!.lastRpm).toBe(0);
            expect(sm.getSession('dev1')!.lastVoltage).toBe(0);
        });

        it('should update maxSpeed on an active trip', () => {
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            sm.processTelemetry('dev1', 80, {});
            sm.processTelemetry('dev1', 120, {});
            sm.processTelemetry('dev1', 100, {});
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.maxSpeed).toBe(120);
        });

        it('should update maxTemp using PID 0009 (offset -40)', () => {
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            sm.processTelemetry('dev1', 60, { '0009': 120 }); // 120 - 40 = 80°C
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.maxTemp).toBe(80);
        });

        it('should accumulate idleSeconds when speed=0 and RPM>300', () => {
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            sm.processTelemetry('dev1', 0, { '0003': 800 }); // idle
            sm.processTelemetry('dev1', 0, { '0003': 900 }); // idle
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.idleSeconds).toBe(20); // 2 * 10
        });

        it('should accumulate speedingSeconds when speed > 120', () => {
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            sm.processTelemetry('dev1', 130, {});
            sm.processTelemetry('dev1', 145, {});
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.speedingSeconds).toBe(20);
        });

        it('should not update trip data when trip is not active', () => {
            // No startTrip call — trip is inactive by default
            sm.processTelemetry('dev1', 200, { '0003': 5000 });
            // endTrip should return null (trip was never started)
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report).toBeNull();
        });
    });

    // ─── startTrip ────────────────────────────────────────────────────────────
    describe('startTrip', () => {
        it('should mark trip as active with correct startTime', () => {
            sm.updateSession('dev1', '1.1.1.1');
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.startTime).toBe('2026-03-25 08:00:00');
        });
    });

    // ─── recordEvent ─────────────────────────────────────────────────────────
    describe('recordEvent', () => {
        beforeEach(() => {
            sm.updateSession('dev1', '1.1.1.1');
            sm.startTrip('dev1', '2026-03-25 08:00:00');
        });

        it('should increment hardBrakes on HB event', () => {
            sm.recordEvent('dev1', 'HB');
            sm.recordEvent('dev1', 'HB');
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.hardBrakes).toBe(2);
        });

        it('should increment hardAccels on HA event', () => {
            sm.recordEvent('dev1', 'HA');
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.hardAccels).toBe(1);
        });

        it('should be a no-op when trip is not active', () => {
            const sm2 = new SessionManager();
            sm2.updateSession('dev2', '1.1.1.2');
            // No startTrip
            sm2.recordEvent('dev2', 'HB');
            const report = sm2.endTrip('dev2', '2026-03-25 09:00:00');
            expect(report).toBeNull();
        });
    });

    // ─── endTrip ─────────────────────────────────────────────────────────────
    describe('endTrip', () => {
        it('should return null when no trip is active', () => {
            sm.updateSession('dev1', '1.1.1.1');
            expect(sm.endTrip('dev1', '2026-03-25 09:00:00')).toBeNull();
        });

        it('should return a complete trip report', () => {
            sm.updateSession('dev1', '1.1.1.1');
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            sm.processTelemetry('dev1', 60, { '0003': 1500 });
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report).not.toBeNull();
            expect(report?.startTime).toBe('2026-03-25 08:00:00');
            expect(report?.endTime).toBe('2026-03-25 09:00:00');
        });

        it('should flag trip as ghost when no real activity occurred', () => {
            sm.updateSession('dev1', '1.1.1.1');
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            // No telemetry → maxSpeed=0, idleSeconds=0, hardAccels=0
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.isGhostTrip).toBe(true);
        });

        it('should NOT flag trip as ghost when there is real activity', () => {
            sm.updateSession('dev1', '1.1.1.1');
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            sm.processTelemetry('dev1', 70, { '0003': 2000 });
            const report = sm.endTrip('dev1', '2026-03-25 09:00:00');
            expect(report?.isGhostTrip).toBe(false);
        });

        it('should reset the trip state after ending', () => {
            sm.updateSession('dev1', '1.1.1.1');
            sm.startTrip('dev1', '2026-03-25 08:00:00');
            sm.endTrip('dev1', '2026-03-25 09:00:00');
            // Ending again should return null (trip already cleared)
            expect(sm.endTrip('dev1', '2026-03-25 10:00:00')).toBeNull();
        });
    });
});
