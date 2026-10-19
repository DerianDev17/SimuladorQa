$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$qaForm = $null
$qaPinBox = $null
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $qaForm = [System.Windows.Forms.Form]::new()
    $qaForm.Text = 'Coonecta QA - PIN de la tarjeta'
    $qaForm.ClientSize = [Drawing.Size]::new(360, 160)
    $qaForm.StartPosition = 'CenterScreen'
    $qaForm.FormBorderStyle = 'FixedDialog'
    $qaForm.MaximizeBox = $false
    $qaForm.MinimizeBox = $false
    $qaForm.TopMost = $true
    $qaLabel = [Windows.Forms.Label]::new()
    $qaLabel.Text = 'Ingresa el PIN para esta transaccion QA.'
    $qaLabel.Location = [Drawing.Point]::new(20, 20)
    $qaLabel.Size = [Drawing.Size]::new(320, 30)
    $qaPinBox = [Windows.Forms.TextBox]::new()
    $qaPinBox.UseSystemPasswordChar = $true
    $qaPinBox.MaxLength = 14
    $qaPinBox.Location = [Drawing.Point]::new(20, 55)
    $qaPinBox.Width = 320
    $qaOk = [Windows.Forms.Button]::new()
    $qaOk.Text = 'Continuar'
    $qaOk.Location = [Drawing.Point]::new(170, 105)
    $qaOk.Add_Click({
        if ($qaPinBox.Text -match '^[0-9]{1,14}$') { $qaForm.DialogResult = 'OK' }
        else { $qaPinBox.Clear(); $qaPinBox.Focus() }
    })
    $qaCancel = [Windows.Forms.Button]::new()
    $qaCancel.Text = 'Cancelar'
    $qaCancel.DialogResult = 'Cancel'
    $qaCancel.Location = [Drawing.Point]::new(260, 105)
    $qaForm.AcceptButton = $qaOk
    $qaForm.CancelButton = $qaCancel
    $qaForm.Controls.AddRange(@($qaLabel, $qaPinBox, $qaOk, $qaCancel))
    $qaForm.Add_Shown({ $qaPinBox.Focus() })
    if ($qaForm.ShowDialog() -eq 'OK') { [Console]::WriteLine($qaPinBox.Text) }
    else { [Console]::WriteLine('CANCEL') }
} catch {
    exit 1
} finally {
    if ($null -ne $qaPinBox) { $qaPinBox.Clear() }
    if ($null -ne $qaForm) { $qaForm.Dispose() }
}
