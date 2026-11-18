#!/usr/bin/env node
// Замер скорости скачивания: N последовательных запросов к одному адресу.
// Запуск: node speedtest.js <url> [количество запросов, по умолчанию 10]
// Зависимостей нет, нужен Node.js 18+ (встроенный fetch).

const DEFAULT_COUNT = 10;
const TIMEOUT_MS = 60_000; // один запрос не должен висеть дольше минуты

function parseArgs(argv) {
  const [url, countArg] = argv;
  if (!url || url === '-h' || url === '--help') {
    console.log('Использование: node speedtest.js <url> [количество запросов]');
    console.log('Пример:        node speedtest.js https://speed.cloudflare.com/__down?bytes=10000000');
    process.exit(url ? 0 : 1);
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    console.error(`Неверный адрес: ${url}. Нужен полный URL, например https://example.com/file.jpg`);
    process.exit(1);
  }
  const count = countArg === undefined ? DEFAULT_COUNT : Number(countArg);
  if (!Number.isInteger(count) || count < 1) {
    console.error(`Неверное количество запросов: ${countArg}. Нужно целое число от 1.`);
    process.exit(1);
  }
  return { url, count };
}

// Один запрос: ждём тело целиком, возвращаем время в миллисекундах и размер в байтах.
async function download(url) {
  const started = performance.now();
  const response = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' }, // просим не отдавать ответ из кэша
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`сервер ответил ${response.status} ${response.statusText}`);

  // Читаем тело по кускам и только считаем байты: большой файл не копится в памяти.
  let bytes = 0;
  for await (const chunk of response.body) bytes += chunk.length;

  return { ms: performance.now() - started, bytes };
}

async function main() {
  const { url, count } = parseArgs(process.argv.slice(2));
  console.log(`Адрес: ${url}`);
  console.log(`Запросов: ${count}, по одному\n`);

  let totalMs = 0;
  let totalBytes = 0;

  for (let i = 1; i <= count; i++) {
    let result;
    try {
      result = await download(url); // await внутри цикла — запросы идут строго по очереди
    } catch (error) {
      const reason = error.name === 'TimeoutError' ? `нет ответа за ${TIMEOUT_MS / 1000} с` : error.message;
      console.error(`Запрос ${i} не удался: ${reason}`);
      process.exit(1);
    }
    totalMs += result.ms;
    totalBytes += result.bytes;
    console.log(`  ${String(i).padStart(2)}. ${result.ms.toFixed(0)} мс, ${(result.bytes / 1e6).toFixed(2)} МБ`);
  }

  if (totalBytes === 0) {
    console.error('\nСервер отдал пустой ответ, скорость посчитать нельзя. Возьми адрес с большим файлом.');
    process.exit(1);
  }

  const seconds = totalMs / 1000;
  const megabits = (totalBytes * 8) / 1e6; // 1 Мбит = 1 000 000 бит
  const megabytes = totalBytes / 1e6; // 1 МБ = 1 000 000 байт

  console.log(`\nСреднее время запроса: ${(totalMs / count).toFixed(0)} мс`);
  console.log(`Всего скачано: ${megabytes.toFixed(2)} МБ (${totalBytes} байт)`);
  console.log(`Скорость скачивания: ${(megabits / seconds).toFixed(2)} Мбит/с (${(megabytes / seconds).toFixed(2)} МБ/с)`);
}

main();
