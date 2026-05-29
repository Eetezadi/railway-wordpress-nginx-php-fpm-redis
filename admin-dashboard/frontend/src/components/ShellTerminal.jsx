import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export default function ShellTerminal({ siteId, getToken }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: '#0a0a0b',
        foreground: '#ececee',
        cursor: '#d4a847',
        cursorAccent: '#0a0a0b',
        selectionBackground: 'rgba(212,168,71,0.2)',
        black: '#141416',
        red: '#e05252',
        green: '#3ec97a',
        yellow: '#d4a847',
        blue: '#6b8cff',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#ececee',
        brightBlack: '#636370',
        brightRed: '#eb6b6b',
        brightGreen: '#86efac',
        brightYellow: '#e4bc5f',
        brightBlue: '#8ca8ff',
        brightMagenta: '#d19de8',
        brightCyan: '#7dccd6',
        brightWhite: '#ffffff',
      },
      lineHeight: 1.4,
      letterSpacing: 0.5,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    term.writeln('\x1b[38;2;212;168;71m Connecting to container...\x1b[0m');

    let ws;

    (async () => {
      try {
        const token = await getToken();
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${proto}://${window.location.host}/api/sites/${siteId}/shell?token=${encodeURIComponent(token)}`;
        ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          term.writeln('\x1b[38;2;62;201;122m Connected.\x1b[0m\r\n');
        };

        ws.onmessage = (event) => {
          term.write(event.data);
        };

        ws.onclose = () => {
          term.writeln('\r\n\x1b[38;2;99;99;112m[Connection closed]\x1b[0m');
        };

        ws.onerror = () => {
          term.writeln('\r\n\x1b[38;2;224;82;82m[Connection error]\x1b[0m');
        };

        term.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });
      } catch (err) {
        term.writeln(`\r\n\x1b[38;2;224;82;82m[Auth error: ${err.message}]\x1b[0m`);
      }
    })();

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (ws) ws.close();
      term.dispose();
    };
  }, [siteId, getToken]);

  return (
    <div className="terminal-container">
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: 400,
          background: '#0a0a0b',
          padding: 8,
        }}
      />
    </div>
  );
}
