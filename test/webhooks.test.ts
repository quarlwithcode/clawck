import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { Clawck } from '../src/core/clawck';
import { makeTmpConfig } from './helpers';

let clawck: Clawck;

afterEach(() => {
  try { clawck?.close(); } catch {}
  vi.restoreAllMocks();
});

describe('Webhook notifications', () => {
  const webhookUrl = 'https://hooks.example.com/test';

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
  });

  it('fires task_completed webhook on stop()', async () => {
    clawck = await new Clawck(makeTmpConfig({
      webhooks: [{
        url: webhookUrl,
        events: ['task_completed'],
      }],
    })).ready();

    const entry = clawck.start({ task: 'webhook test' });
    clawck.stop({ id: entry.id });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = (globalThis.fetch as any).mock.calls[0];
    expect(calledUrl).toBe(webhookUrl);
    const body = JSON.parse(calledOpts.body);
    expect(body.event).toBe('task_completed');
    expect(body.entry).toBeDefined();
    expect(body.entry.id).toBe(entry.id);
  });

  it('fires task_failed webhook for failed status', async () => {
    clawck = await new Clawck(makeTmpConfig({
      webhooks: [{
        url: webhookUrl,
        events: ['task_failed'],
      }],
    })).ready();

    const entry = clawck.start({ task: 'failing task' });
    clawck.stop({ id: entry.id, status: 'failed' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.event).toBe('task_failed');
  });

  it('does not fire webhook for unsubscribed events', async () => {
    clawck = await new Clawck(makeTmpConfig({
      webhooks: [{
        url: webhookUrl,
        events: ['idle_alert'],  // only subscribed to idle_alert
      }],
    })).ready();

    const entry = clawck.start({ task: 'no webhook' });
    clawck.stop({ id: entry.id });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sends custom headers when configured', async () => {
    clawck = await new Clawck(makeTmpConfig({
      webhooks: [{
        url: webhookUrl,
        events: ['task_completed'],
        headers: { 'X-Api-Key': 'secret123' },
      }],
    })).ready();

    const entry = clawck.start({ task: 'header test' });
    clawck.stop({ id: entry.id });

    const calledOpts = (globalThis.fetch as any).mock.calls[0][1];
    expect(calledOpts.headers['X-Api-Key']).toBe('secret123');
    expect(calledOpts.headers['Content-Type']).toBe('application/json');
  });

  it('fires to multiple webhooks subscribed to the same event', async () => {
    clawck = await new Clawck(makeTmpConfig({
      webhooks: [
        { url: 'https://hooks1.example.com', events: ['task_completed'] },
        { url: 'https://hooks2.example.com', events: ['task_completed'] },
      ],
    })).ready();

    const entry = clawck.start({ task: 'multi webhook' });
    clawck.stop({ id: entry.id });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('silently handles fetch errors', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    clawck = await new Clawck(makeTmpConfig({
      webhooks: [{
        url: webhookUrl,
        events: ['task_completed'],
      }],
    })).ready();

    const entry = clawck.start({ task: 'error test' });
    // Should not throw
    expect(() => clawck.stop({ id: entry.id })).not.toThrow();
  });

  it('does nothing when no webhooks configured', async () => {
    clawck = await new Clawck(makeTmpConfig()).ready();

    const entry = clawck.start({ task: 'no webhooks' });
    clawck.stop({ id: entry.id });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
