# Propuesta de manejo de ramas

Documento para discutir en equipo. Las secciones marcadas **(por acordar)** necesitan una decisión del grupo.

## Situación actual

- Solo existe `main`, y los cambios se suben directamente a ella.
- El repositorio está en `github.com/SantiagoGetialAyala/ContraloriaApp`. Para subir ramas, cada integrante debe ser colaborador del repositorio (lo configura Santiago en *Settings → Collaborators*).
- Ojo con la carpeta: el repositorio real es `ContraloriaApp/`. Si alguien tiene una carpeta superior con otro `.git`, debe trabajar siempre dentro de `ContraloriaApp/`.

## Propuesta: una rama por funcionalidad

```
main ──●────────────●───────────────●──  (siempre funciona; se usa para demos)
        \          /  \            /
         feature/vacaciones        fix/incapacidades-recobro
```

1. `main` siempre debe funcionar y pasar las pruebas. No se programa directamente en ella.
2. Cada tarea va en su propia rama, que sale de `main` actualizada:
   - `feature/<nombre>` para funcionalidades nuevas (`feature/vacaciones`, `feature/calendario-vacaciones`).
   - `fix/<nombre>` para correcciones (`fix/viaticos-rechazo`).
   - `docs/<nombre>` para documentación.
3. Al terminar, se abre un **Pull Request** hacia `main` en GitHub con:
   - qué cambia y por qué,
   - cómo probarlo,
   - el resultado de `python manage.py test tests`.
4. **(por acordar)** Al menos un compañero revisa y aprueba antes de fusionar.
5. Después de fusionar, se borra la rama.

### Comandos básicos

```sh
# Empezar una tarea
git switch main
git pull
git switch -c feature/mi-tarea

# Guardar avances (commits pequeños, mensajes en español)
git add <archivos>
git commit -m "Agregar cálculo de días hábiles para vacaciones"

# Traer lo nuevo de main a mi rama
git switch main && git pull
git switch feature/mi-tarea
git merge main

# Subir la rama y abrir el Pull Request en GitHub
git push -u origin feature/mi-tarea
```

## Cuidado especial: migraciones de Django

Las migraciones se numeran (`0003_...`, `0004_...`). Si dos ramas crean una migración al mismo tiempo, ambas tendrán el mismo número y Django fallará al juntarlas.

- Avisen en el grupo antes de crear una migración nueva.
- Antes de crearla, actualicen su rama con `main`.
- Si de todas formas hay choque, quien fusione de segundo ejecuta `python manage.py makemigrations --merge` o regenera la suya.
- `feature/vacaciones` ya incluye `0003_vacaciones`.

## Nunca subir al repositorio

- `var/`, `var-demo/`, `.venv/` ni archivos `.env`. Ya están en `.gitignore`.
- Archivos con datos reales de funcionarios, como el Excel de programación de vacaciones: tiene cédulas.
- Contraseñas o claves.

## Ramas sugeridas en este momento

| Rama | Contenido | Estado |
| --- | --- | --- |
| `feature/vacaciones` | Backend del módulo de vacaciones, datos de demostración y documentación | Lista para revisión |
| `fix/incapacidades-recobro` | El recobro y el reconocimiento quedaron inalcanzables tras el recorte de pasos | Por hacer |
| `fix/viaticos-rechazo` | Viáticos ya no permite rechazar una solicitud | Por hacer |
| `docs/actualizar-flujos` | README y matriz describen los flujos largos anteriores | Por hacer |

## Puntos para debatir

1. ¿Quién revisa los Pull Requests? ¿Basta con uno o se necesitan dos?
2. ¿Fusionar con *merge* normal o con *squash* (un solo commit por funcionalidad)?
3. ¿Protegemos `main` en GitHub para que nadie suba directo? Lo configura el dueño del repositorio.
4. ¿Cómo repartimos el trabajo de vacaciones entre backend y frontend? Ver `docs/vacaciones-frontend.md`.
5. ¿Qué versión de `main` se usa para las demostraciones a la Contraloría?
