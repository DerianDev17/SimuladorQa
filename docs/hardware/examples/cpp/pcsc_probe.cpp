// Diagnóstico PC/SC de nivel A para Windows/C++17. No transmite APDU.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winscard.h>

#include <array>
#include <cwchar>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

class PcscContext {
public:
    PcscContext() : status_(SCardEstablishContext(SCARD_SCOPE_USER, nullptr, nullptr, &value_)) {}
    ~PcscContext() {
        if (status_ == SCARD_S_SUCCESS) SCardReleaseContext(value_);
    }
    PcscContext(const PcscContext&) = delete;
    PcscContext& operator=(const PcscContext&) = delete;
    LONG status() const { return status_; }
    SCARDCONTEXT get() const { return value_; }

private:
    SCARDCONTEXT value_{};
    LONG status_{};
};

class PcscCard {
public:
    LONG connect(SCARDCONTEXT context, const wchar_t* reader) {
        return SCardConnectW(context, reader, SCARD_SHARE_SHARED,
                             SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1, &value_, &protocol_);
    }
    ~PcscCard() {
        if (value_ != 0) SCardDisconnect(value_, SCARD_LEAVE_CARD);
    }
    PcscCard(const PcscCard&) = delete;
    PcscCard& operator=(const PcscCard&) = delete;
    PcscCard() = default;
    SCARDHANDLE get() const { return value_; }

private:
    SCARDHANDLE value_{};
    DWORD protocol_{};
};

int wmain(int argc, wchar_t* argv[]) {
    if (argc > 2) {
        std::wcerr << L"Uso: pcsc_probe.exe [nombre exacto del lector]\n";
        return 2;
    }
    PcscContext context;
    if (context.status() != SCARD_S_SUCCESS) {
        std::wcerr << L"PC/SC no está disponible.\n";
        return 1;
    }

    DWORD chars = 0;
    LONG status = SCardListReadersW(context.get(), nullptr, nullptr, &chars);
    if (status == SCARD_E_NO_READERS_AVAILABLE) {
        std::wcout << L"No hay lectores disponibles.\n";
        return 0;
    }
    if (status != SCARD_S_SUCCESS || chars < 2 || chars > 4096) {
        std::wcerr << L"No se pudo enumerar lectores.\n";
        return 1;
    }
    std::vector<wchar_t> names(chars);
    status = SCardListReadersW(context.get(), nullptr, names.data(), &chars);
    if (status != SCARD_S_SUCCESS) {
        std::wcerr << L"No se pudo enumerar lectores.\n";
        return 1;
    }

    if (argc == 1) {
        std::wcout << L"Lectores disponibles:\n";
        for (const wchar_t* item = names.data(); *item; item += std::wcslen(item) + 1)
            std::wcout << L"- " << item << L'\n';
        return 0;
    }

    bool found = false;
    for (const wchar_t* item = names.data(); *item; item += std::wcslen(item) + 1)
        if (std::wcscmp(item, argv[1]) == 0) found = true;
    if (!found) {
        std::wcerr << L"El lector indicado no está disponible.\n";
        return 1;
    }

    PcscCard card;
    if (card.connect(context.get(), argv[1]) != SCARD_S_SUCCESS) {
        std::wcerr << L"No se pudo conectar con una tarjeta presente.\n";
        return 1;
    }
    std::array<wchar_t, 256> readerName{};
    DWORD readerChars = static_cast<DWORD>(readerName.size());
    DWORD state = 0, protocol = 0;
    std::array<BYTE, 36> atr{};
    DWORD atrBytes = static_cast<DWORD>(atr.size());
    status = SCardStatusW(card.get(), readerName.data(), &readerChars, &state,
                          &protocol, atr.data(), &atrBytes);
    if (status != SCARD_S_SUCCESS || atrBytes > atr.size()) {
        std::wcerr << L"No se pudo leer el estado de la tarjeta.\n";
        return 1;
    }
    std::wcout << L"Lector: " << argv[1] << L"\nATR: ";
    for (DWORD index = 0; index < atrBytes; ++index)
        std::wcout << std::uppercase << std::hex << std::setfill(L'0')
                   << std::setw(2) << static_cast<unsigned>(atr[index]);
    std::wcout << L'\n';
    return 0;
}
