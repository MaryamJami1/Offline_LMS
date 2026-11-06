// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_BRANDING } from '@lingualab/shared';
import { approvedShell } from './test/shell-harness.js';

/**
 * ADM-07 in the student app: the name, logo and main colour come from
 * `GET /settings/branding` (rule 8). The screens may load nothing from the
 * network, so the main process fetches the logo and hands it over as a data
 * URL; when the server cannot say, the app is "Lab" in the default blue.
 */

describe('ADM-07 the branding the screens get', () => {
  it('is what the server says', async () => {
    const { shell, server } = approvedShell();
    vi.spyOn(server, 'branding').mockResolvedValue({
      softwareName: 'Speak Lab',
      instituteName: 'Al-Noor Institute',
      logoUrl: null,
      primaryColour: '#0F5132',
    });

    expect(await shell.branding()).toEqual({
      softwareName: 'Speak Lab',
      instituteName: 'Al-Noor Institute',
      logoUrl: null,
      primaryColour: '#0F5132',
    });
  });

  it('carries the logo as a data URL', async () => {
    const { shell, server } = approvedShell();
    vi.spyOn(server, 'branding').mockResolvedValue({
      ...DEFAULT_BRANDING,
      logoUrl: '/api/settings/branding/logo',
    });
    const logo = vi.spyOn(server, 'logo').mockResolvedValue('data:image/png;base64,AQID');

    expect((await shell.branding()).logoUrl).toBe('data:image/png;base64,AQID');
    expect(logo).toHaveBeenCalledWith('/api/settings/branding/logo');
  });

  it('is "Lab" in the default blue when the server cannot be reached', async () => {
    const { shell, server } = approvedShell();
    server.reachable = false;

    expect(await shell.branding()).toEqual(DEFAULT_BRANDING);
  });
});
