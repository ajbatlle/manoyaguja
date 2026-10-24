# Convierte fotos HEIC del iPhone a JPG, usando el codec HEIF de Windows.
# Uso: powershell -ExecutionPolicy Bypass -File heic-a-jpg.ps1 <foto.heic> [<otra.heic> ...]
# Deja cada JPG al lado del original, con el mismo nombre.
Add-Type -AssemblyName PresentationCore
foreach ($ruta in $args) {
  $entrada = [IO.File]::OpenRead($ruta)
  $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create($entrada, [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat, [Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
  $encoder = New-Object Windows.Media.Imaging.JpegBitmapEncoder
  $encoder.QualityLevel = 95
  $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($decoder.Frames[0]))
  $destino = [IO.Path]::ChangeExtension($ruta, '.jpg')
  $salida = [IO.File]::Create($destino)
  $encoder.Save($salida)
  $salida.Close(); $entrada.Close()
  $destino
}
