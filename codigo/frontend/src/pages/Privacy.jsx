export default function Privacy() {
  return (
    <div className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <h1 className="text-xl font-black text-mute-amber mb-6">Aviso de Privacidad</h1>
      <div className="text-mute-muted text-sm leading-relaxed space-y-4">
        <p className="text-mute-muted/60 text-xs">Ultima actualizacion: Abril 2026</p>

        <p>
          <strong className="text-white">Human Hood Hospitality Group SA de CV</strong>{' '}
          (en adelante "el Responsable"), con domicilio en Leon, Guanajuato, Mexico, es
          responsable del tratamiento de tus datos personales conforme a la Ley Federal de
          Proteccion de Datos Personales en Posesion de los Particulares (LFPDPPP).
        </p>

        <h2 className="text-white font-bold text-base mt-6">
          Datos Personales que Recopilamos
        </h2>
        <p>
          Para las finalidades descritas, recopilamos los siguientes datos personales:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Datos de identificacion: nombre completo</li>
          <li>Datos de contacto: numero telefonico</li>
          <li>
            Datos biometricos: fotografia facial y descriptores biometricos derivados
          </li>
          <li>Datos de uso: registros de acceso al establecimiento</li>
        </ul>

        <h2 className="text-white font-bold text-base mt-6">
          Finalidades del Tratamiento
        </h2>
        <p>
          <strong>Finalidades primarias (necesarias):</strong>
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Control de acceso al establecimiento MUTE</li>
          <li>Verificacion y autenticacion de identidad</li>
          <li>Seguridad del establecimiento y sus visitantes</li>
        </ul>
        <p className="mt-2">
          <strong>Finalidades secundarias:</strong>
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Comunicaciones de marketing y promociones</li>
          <li>Estadisticas de asistencia y mejora del servicio</li>
          <li>Uso de imagen con fines promocionales del establecimiento</li>
        </ul>

        <h2 className="text-white font-bold text-base mt-6">Transferencia de Datos</h2>
        <p>
          Tus datos personales no seran transferidos a terceros sin tu consentimiento,
          salvo en los casos previstos por la LFPDPPP y su Reglamento.
        </p>

        <h2 className="text-white font-bold text-base mt-6">Medidas de Seguridad</h2>
        <p>
          Implementamos medidas de seguridad administrativas, tecnicas y fisicas para
          proteger tus datos personales, incluyendo encriptacion de datos en transito y en
          reposo, acceso restringido por autenticacion, y almacenamiento en servidores
          seguros.
        </p>

        <h2 className="text-white font-bold text-base mt-6">Derechos ARCO</h2>
        <p>
          Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte al tratamiento de tus
          datos personales (derechos ARCO). Para ejercer estos derechos, envia un correo
          a:
        </p>
        <p className="text-mute-amber">privacidad@humanhood.mx</p>

        <h2 className="text-white font-bold text-base mt-6">Consentimiento</h2>
        <p>
          Al proporcionar tus datos personales y biometricos a traves de nuestra
          plataforma, otorgas tu consentimiento expreso para el tratamiento de los mismos
          conforme a este Aviso de Privacidad.
        </p>

        <h2 className="text-white font-bold text-base mt-6">
          Cambios al Aviso de Privacidad
        </h2>
        <p>
          Nos reservamos el derecho de modificar este Aviso de Privacidad. Cualquier
          cambio sera publicado en nuestra plataforma.
        </p>

        <p className="mt-8 text-mute-muted/40 text-xs">
          Human Hood Hospitality Group SA de CV. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
