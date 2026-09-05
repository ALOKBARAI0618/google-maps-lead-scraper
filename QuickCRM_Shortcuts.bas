Attribute VB_Name = "QuickCRM_Shortcuts"
' ======================================================================
' Quick CRM Excel Shortcuts Module
' Keyboard shortcuts for fast lead status updates directly inside Excel
'
' How to Install:
' 1. Open your Excel workbook (e.g. Mumbai Data.xlsx)
' 2. Press [Alt + F11] to open the VBA Editor
' 3. Click File -> Import File -> Select this "QuickCRM_Shortcuts.bas"
' 4. Run "Setup_CRM_Shortcuts" (or press Alt + F8 and choose Setup_CRM_Shortcuts)
'
' Shortcuts Configured:
'   Ctrl + Shift + C -> Mark Call = "Yes"
'   Ctrl + Shift + N -> Mark Not Call = "Yes"
'   Ctrl + Shift + D -> Mark Asking for Detailed = "Yes"
'   Ctrl + Shift + R -> Mark Directly Rejected = "Yes"
'   Ctrl + Shift + F -> Prompt & Enter Follow Up Date
'   Ctrl + Shift + W -> Prompt & Enter What was discussed on call?
'   Ctrl + Shift + O -> Prompt & Append to Notes
' ======================================================================

Public Sub Setup_CRM_Shortcuts()
    Application.OnKey "^+C", "CRM_Mark_Call_Yes"
    Application.OnKey "^+N", "CRM_Mark_NotCall_Yes"
    Application.OnKey "^+D", "CRM_Mark_Details_Yes"
    Application.OnKey "^+R", "CRM_Mark_Rejected_Yes"
    Application.OnKey "^+F", "CRM_Set_FollowUp"
    Application.OnKey "^+W", "CRM_Set_Discussed"
    Application.OnKey "^+O", "CRM_Add_Note"
    MsgBox "Quick CRM Shortcuts are now active!" & vbCrLf & vbCrLf & _
           "Ctrl+Shift+C : Call = Yes" & vbCrLf & _
           "Ctrl+Shift+N : Not Call = Yes" & vbCrLf & _
           "Ctrl+Shift+D : Details = Yes" & vbCrLf & _
           "Ctrl+Shift+R : Rejected = Yes" & vbCrLf & _
           "Ctrl+Shift+F : Follow Up Date" & vbCrLf & _
           "Ctrl+Shift+W : What was discussed" & vbCrLf & _
           "Ctrl+Shift+O : Add Note", vbInformation, "CRM Shortcuts Ready"
End Sub

Public Sub Remove_CRM_Shortcuts()
    Application.OnKey "^+C"
    Application.OnKey "^+N"
    Application.OnKey "^+D"
    Application.OnKey "^+R"
    Application.OnKey "^+F"
    Application.OnKey "^+W"
    Application.OnKey "^+O"
    MsgBox "CRM Shortcuts deactivated.", vbInformation
End Sub

Private Function FindCol(colName As String) As Long
    Dim ws As Worksheet, cell As Range
    Set ws = ActiveSheet
    For Each cell In ws.Rows(1).Cells
        If Trim(CStr(cell.Value)) = Trim(colName) Then
            FindCol = cell.Column
            Exit Function
        End If
        If cell.Column > 40 Then Exit For
    Next cell
    FindCol = 0
End Function

Public Sub CRM_Mark_Call_Yes()
    Dim col As Long: col = FindCol("Call")
    If col > 0 And ActiveCell.Row > 1 Then
        Cells(ActiveCell.Row, col).Value = "Yes"
    End If
End Sub

Public Sub CRM_Mark_NotCall_Yes()
    Dim col As Long: col = FindCol("Not Call")
    If col > 0 And ActiveCell.Row > 1 Then
        Cells(ActiveCell.Row, col).Value = "Yes"
    End If
End Sub

Public Sub CRM_Mark_Details_Yes()
    Dim col As Long: col = FindCol("Asking for Detailed")
    If col > 0 And ActiveCell.Row > 1 Then
        Cells(ActiveCell.Row, col).Value = "Yes"
    End If
End Sub

Public Sub CRM_Mark_Rejected_Yes()
    Dim col As Long: col = FindCol("Directly Rejected")
    If col > 0 And ActiveCell.Row > 1 Then
        Cells(ActiveCell.Row, col).Value = "Yes"
        Dim cCall As Long: cCall = FindCol("Call")
        If cCall > 0 Then Cells(ActiveCell.Row, cCall).Value = "Yes"
    End If
End Sub

Public Sub CRM_Set_FollowUp()
    Dim col As Long: col = FindCol("Follow Up Date")
    If col > 0 And ActiveCell.Row > 1 Then
        Dim defaultDate As String
        defaultDate = Format(Date + 1, "dd/mm/yyyy")
        Dim res As String
        res = InputBox("Enter Follow Up Date (default tomorrow):", "Follow Up Date", defaultDate)
        If Trim(res) <> "" Then Cells(ActiveCell.Row, col).Value = Trim(res)
    End If
End Sub

Public Sub CRM_Set_Discussed()
    Dim col As Long: col = FindCol("What was discussed on call?")
    If col > 0 And ActiveCell.Row > 1 Then
        Dim res As String
        res = InputBox("What was discussed on this call?", "Call Discussion Summary")
        If Trim(res) <> "" Then Cells(ActiveCell.Row, col).Value = Trim(res)
    End If
End Sub

Public Sub CRM_Add_Note()
    Dim col As Long: col = FindCol("Notes")
    If col > 0 And ActiveCell.Row > 1 Then
        Dim res As String
        res = InputBox("Enter note to append:", "Add Note")
        If Trim(res) <> "" Then
            Dim currentNotes As String
            currentNotes = Trim(CStr(Cells(ActiveCell.Row, col).Value))
            Dim timeStamp As String
            timeStamp = "[" & Format(Now, "dd/mm/yyyy hh:mm") & "] "
            If currentNotes = "" Then
                Cells(ActiveCell.Row, col).Value = timeStamp & Trim(res)
            Else
                Cells(ActiveCell.Row, col).Value = currentNotes & " | " & timeStamp & Trim(res)
            End If
        End If
    End If
End Sub
