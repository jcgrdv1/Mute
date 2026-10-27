export default function Terms() {
  return (
    <div className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <h1 className="text-xl font-black text-mute-amber mb-6">
        Terminos y Condiciones de Uso
      </h1>
      <div className="text-mute-muted text-sm leading-relaxed space-y-4">
        <p className="text-mute-muted/60 text-xs">Ultima actualizacion: Abril 2026</p>

        <p>
          Al registrarte en la plataforma de acceso de{' '}
          <strong className="text-white">MUTE</strong>, operada por{' '}
          <strong className="text-white">Human Hood Hospitality Group SA de CV</strong>,
          aceptas los siguientes terminos:
        </p>

        <h2 className="text-white font-bold text-base mt-6">1. Uso del Servicio</h2>
        <p>
          El sistema de reconocimiento facial de MUTE es una herramienta de control de
          acceso para el establecimiento. Al registrarte, proporcionas voluntariamente tu
          imagen facial, nombre y datos de contacto para ser identificado al momento de
          ingresar al establecimiento.
        </p>

        <h2 className="text-white font-bold text-base mt-6">2. Uso de Imagen</h2>
        <p>Tu imagen facial sera utilizada exclusivamente para:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Control de acceso al establecimiento</li>
          <li>Identificacion y verificacion de identidad en la entrada</li>
          <li>Comunicaciones de marketing y promociones del establecimiento</li>
          <li>Mejora de la experiencia del cliente</li>
        </ul>
        <p>
          Tu imagen no sera compartida con terceros ajenos a Human Hood Hospitality Group
          SA de CV sin tu consentimiento expreso.
        </p>

        <h2 className="text-white font-bold text-base mt-6">3. Datos Recopilados</h2>
        <p>Recopilamos los siguientes datos:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nombre completo</li>
          <li>Numero de telefono</li>
          <li>Fotografia facial</li>
          <li>Datos biometricos derivados de la imagen (descriptores faciales)</li>
          <li>Registros de acceso (fecha y hora de visita)</li>
        </ul>

        <h2 className="text-white font-bold text-base mt-6">
          4. Almacenamiento y Seguridad
        </h2>
        <p>
          Tus datos son almacenados en servidores seguros con encriptacion. Los
          descriptores biometricos se utilizan unicamente para la comparacion en tiempo
          real y no permiten reconstruir tu imagen facial.
        </p>

        <h2 className="text-white font-bold text-base mt-6">5. Derechos del Usuario</h2>
        <p>Tienes derecho a:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Solicitar la eliminacion de tus datos en cualquier momento</li>
          <li>Solicitar acceso a la informacion que tenemos sobre ti</li>
          <li>Revocar tu consentimiento para el uso de tu imagen</li>
        </ul>
        <p>
          Para ejercer estos derechos, contacta a:{' '}
          <span className="text-mute-amber">privacidad@humanhood.mx</span>
        </p>

        <h2 className="text-white font-bold text-base mt-6">6. Consentimiento</h2>
        <p>
          Al marcar la casilla de aceptacion durante el registro, confirmas que has leido
          y aceptas estos terminos y condiciones, y que otorgas tu consentimiento libre,
          informado y expreso para el tratamiento de tus datos personales y biometricos
          conforme a lo aqui descrito.
        </p>

        <h2 className="text-white font-bold text-base mt-6">7. Modificaciones</h2>
        <p>
          Human Hood Hospitality Group SA de CV se reserva el derecho de modificar estos
          terminos en cualquier momento. Los cambios seran efectivos desde su publicacion.
        </p>

        <p className="mt-8 text-mute-muted/40 text-xs">
          Human Hood Hospitality Group SA de CV. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
