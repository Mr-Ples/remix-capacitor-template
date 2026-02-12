import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { SessionLog } from '../types/pomodoro';

function logsToCsv(logs: SessionLog[]): string {
  const header = [
    'id',
    'profileId',
    'sessionStartTime',
    'roundNumber',
    'phaseType',
    'phaseEndTime',
    'notes',
    'answersJson',
  ];

  const rows = logs.map((log) => [
    log.id,
    log.profileId,
    log.sessionStartTime,
    log.roundNumber,
    log.phaseType,
    log.phaseEndTime,
    (log.notes || '').replace(/\n/g, ' '),
    JSON.stringify(log.answers ?? {}),
  ]);

  return [header, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
}

export async function exportLogs(logs: SessionLog[]): Promise<void> {
  if (!logs || logs.length === 0) {
    throw new Error('No logs provided for export.');
  }

  const csv = logsToCsv(logs);
  const fileName = `pomodoro-logs-${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-')}.csv`;

  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: csv,
    directory: Directory.Documents,
    encoding: 'utf8',
  });

  await Share.share({
    title: 'Export Pomodoro Logs',
    text: 'Pomodoro Plus session logs',
    files: [uri],
    dialogTitle: 'Export logs',
  });
}

