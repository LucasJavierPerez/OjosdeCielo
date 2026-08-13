/**
 * Render mínimo del subconjunto de Markdown que usa la política: títulos,
 * viñetas, párrafos y negrita.
 *
 * No se suma una librería de Markdown por esto. El texto lo escribe la clínica
 * y es el único de la aplicación con este formato; una dependencia de 40 kB
 * para una pantalla que se abre una vez no se paga.
 */
export function TextoPolitica({ contenido }: { contenido: string }) {
  const bloques = contenido.trim().split(/\n{2,}/);

  return (
    <div className="mt-6 space-y-4">
      {bloques.map((bloque) => {
        const clave = bloque.slice(0, 60);

        if (bloque.startsWith('## ')) {
          return (
            <h2 key={clave} className="pt-4 text-lg font-semibold">
              {bloque.slice(3)}
            </h2>
          );
        }

        if (bloque.startsWith('# ')) {
          return (
            <h1 key={clave} className="text-2xl font-semibold">
              {bloque.slice(2)}
            </h1>
          );
        }

        if (bloque.startsWith('- ')) {
          return (
            <ul key={clave} className="list-disc space-y-1.5 pl-5 text-slate-700">
              {bloque.split('\n- ').map((item) => (
                <li key={item.slice(0, 40)}>
                  <Negritas texto={item.replace(/^- /, '')} />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={clave} className="text-slate-700">
            <Negritas texto={bloque} />
          </p>
        );
      })}
    </div>
  );
}

function Negritas({ texto }: { texto: string }) {
  const partes = texto.split(/\*\*(.+?)\*\*/gs);
  return (
    <>
      {partes.map((parte, i) =>
        // Las posiciones impares son lo que estaba entre asteriscos.
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos de un texto plano
          <strong key={i}>{parte}</strong>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos de un texto plano
          <span key={i}>{parte.replace(/\n/g, ' ')}</span>
        ),
      )}
    </>
  );
}
