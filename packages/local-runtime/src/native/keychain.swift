import Foundation
import Security

struct Request: Decodable {
    let operation: String
    let account: String
    let value: String?
}

enum HelperError: Error {
    case invalidInput
    case invalidValue
    case keychain(OSStatus)
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

do {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard input.count <= 32 * 1024 else { throw HelperError.invalidInput }
    let request = try JSONDecoder().decode(Request.self, from: input)
    guard request.account.range(of: "^[a-z0-9:_-]{1,128}$", options: .regularExpression) != nil else {
        throw HelperError.invalidInput
    }

    let baseQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "io.forgetbase.local",
        kSecAttrAccount as String: request.account
    ]

    switch request.operation {
    case "get":
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { exit(44) }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            throw HelperError.keychain(status)
        }
        FileHandle.standardOutput.write(Data(value.utf8))

    case "set":
        guard let value = request.value, let data = value.data(using: .utf8), data.count <= 16 * 1024 else {
            throw HelperError.invalidValue
        }
        let updateStatus = SecItemUpdate(
            baseQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecItemNotFound {
            var addQuery = baseQuery
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrLabel as String] = "ForgetBase Local"
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw HelperError.keychain(addStatus) }
        } else if updateStatus != errSecSuccess {
            throw HelperError.keychain(updateStatus)
        }

    case "delete":
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw HelperError.keychain(status)
        }

    default:
        throw HelperError.invalidInput
    }
} catch HelperError.keychain(let status) {
    fail("keychain operation failed (\(status))")
} catch {
    fail("invalid keychain helper request")
}
