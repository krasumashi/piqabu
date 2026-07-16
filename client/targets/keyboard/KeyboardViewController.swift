import UIKit

/// Piqabu's iOS keyboard is intentionally offline.
///
/// It generates a room code on-device and inserts the same universal link as
/// the Android keyboard. It does not request Full Access, use the pasteboard,
/// connect to the network, retain keystrokes, or attempt to launch Piqabu from
/// the extension (which App Review forbids for keyboard extensions).
final class KeyboardViewController: UIInputViewController {
    private enum KeyboardLayout: Equatable {
        case letters
        case symbols
    }

    private let roomAlphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
    private let decoyPhrases = [
        "Running late, see you soon.",
        "On a call — will reply later.",
        "In a meeting, message back in a bit.",
        "Driving. Back to you when I park.",
        "Sorry, low battery — talk later."
    ]

    private let backgroundColor = UIColor(red: 0.024, green: 0.027, blue: 0.035, alpha: 1)
    private let keyColor = UIColor(red: 0.105, green: 0.112, blue: 0.132, alpha: 1)
    private let actionKeyColor = UIColor(red: 0.165, green: 0.176, blue: 0.205, alpha: 1)
    private let inkColor = UIColor(red: 0.965, green: 0.953, blue: 0.914, alpha: 1)
    private let mutedColor = UIColor(red: 0.64, green: 0.65, blue: 0.68, alpha: 1)

    private let statusLabel = UILabel()
    private let guidanceLabel = UILabel()
    private let mintButton = UIButton(type: .system)
    private let keysStack = UIStackView()

    private var currentLayout: KeyboardLayout = .letters
    private var isShifted = false
    private var mintedCode: String?
    private var letterButtons: [(button: UIButton, value: String)] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        setupKeyboard()
        rebuildKeys()
    }

    private func setupKeyboard() {
        view.backgroundColor = backgroundColor

        let height = view.heightAnchor.constraint(equalToConstant: 332)
        height.priority = UILayoutPriority(999)
        height.isActive = true

        let root = UIStackView()
        root.axis = .vertical
        root.spacing = 6
        root.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(root)

        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 6),
            root.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -6),
            root.topAnchor.constraint(equalTo: view.topAnchor, constant: 7),
            root.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -7)
        ])

        let strip = UIStackView()
        strip.axis = .horizontal
        strip.alignment = .center
        strip.spacing = 8
        strip.isLayoutMarginsRelativeArrangement = true
        strip.layoutMargins = UIEdgeInsets(top: 4, left: 10, bottom: 4, right: 6)
        strip.backgroundColor = UIColor.white.withAlphaComponent(0.035)
        strip.layer.cornerRadius = 8
        strip.heightAnchor.constraint(equalToConstant: 40).isActive = true

        let pulse = UIView()
        pulse.backgroundColor = inkColor.withAlphaComponent(0.42)
        pulse.layer.cornerRadius = 4
        pulse.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            pulse.widthAnchor.constraint(equalToConstant: 8),
            pulse.heightAnchor.constraint(equalToConstant: 8)
        ])

        statusLabel.text = "PIQABU · IDLE"
        statusLabel.textColor = inkColor
        statusLabel.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .semibold)
        statusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        configureButton(mintButton, title: "MINT", action: #selector(mintOrReset), actionStyle: true)
        mintButton.accessibilityHint = "Inserts a new Piqabu private-channel link"
        mintButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 72).isActive = true

        strip.addArrangedSubview(pulse)
        strip.addArrangedSubview(statusLabel)
        strip.addArrangedSubview(mintButton)
        root.addArrangedSubview(strip)

        guidanceLabel.text = "MINT inserts a link. Send it, then tap it to enter Piqabu."
        guidanceLabel.textColor = mutedColor
        guidanceLabel.font = UIFont.monospacedSystemFont(ofSize: 9, weight: .regular)
        guidanceLabel.textAlignment = .center
        guidanceLabel.numberOfLines = 1
        guidanceLabel.adjustsFontSizeToFitWidth = true
        guidanceLabel.minimumScaleFactor = 0.75
        guidanceLabel.heightAnchor.constraint(equalToConstant: 18).isActive = true
        root.addArrangedSubview(guidanceLabel)

        keysStack.axis = .vertical
        keysStack.spacing = 6
        keysStack.distribution = .fillEqually
        root.addArrangedSubview(keysStack)
    }

    private func rebuildKeys() {
        keysStack.arrangedSubviews.forEach { row in
            keysStack.removeArrangedSubview(row)
            row.removeFromSuperview()
        }
        letterButtons.removeAll()

        switch currentLayout {
        case .letters:
            keysStack.addArrangedSubview(characterRow(Array("qwertyuiop").map { String($0) }))
            keysStack.addArrangedSubview(characterRow(Array("asdfghjkl").map { String($0) }, inset: 14))
            keysStack.addArrangedSubview(letterThirdRow())
        case .symbols:
            keysStack.addArrangedSubview(characterRow(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]))
            keysStack.addArrangedSubview(characterRow(["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""]))
            keysStack.addArrangedSubview(symbolThirdRow())
        }

        keysStack.addArrangedSubview(bottomRow())
        updateShiftTitles()
    }

    private func characterRow(_ values: [String], inset: CGFloat = 0) -> UIStackView {
        let row = equalRow()
        row.isLayoutMarginsRelativeArrangement = inset > 0
        row.layoutMargins = UIEdgeInsets(top: 0, left: inset, bottom: 0, right: inset)
        values.forEach { row.addArrangedSubview(characterButton($0)) }
        return row
    }

    private func letterThirdRow() -> UIStackView {
        let row = equalRow()
        let shift = actionButton("⇧") { [weak self] in
            guard let self else { return }
            self.isShifted.toggle()
            self.updateShiftTitles()
        }
        shift.accessibilityLabel = "Shift"
        row.addArrangedSubview(shift)
        Array("zxcvbnm").map { String($0) }.forEach { row.addArrangedSubview(characterButton($0)) }
        row.addArrangedSubview(deleteButton())
        return row
    }

    private func symbolThirdRow() -> UIStackView {
        let row = equalRow()
        [".", ",", "?", "!", "'", "#", "%", "+", "="].forEach {
            row.addArrangedSubview(characterButton($0))
        }
        row.addArrangedSubview(deleteButton())
        return row
    }

    private func bottomRow() -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 5
        row.distribution = .fill

        let globe = UIButton(type: .system)
        styleButton(globe, title: "🌐", actionStyle: true)
        globe.accessibilityLabel = "Next keyboard"
        globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        globe.widthAnchor.constraint(equalToConstant: 44).isActive = true

        let modeTitle = currentLayout == .letters ? "123" : "ABC"
        let mode = actionButton(modeTitle) { [weak self] in
            guard let self else { return }
            self.currentLayout = self.currentLayout == .letters ? .symbols : .letters
            self.isShifted = false
            self.rebuildKeys()
        }
        mode.accessibilityLabel = "Switch letters and numbers"
        mode.widthAnchor.constraint(equalToConstant: 50).isActive = true

        let decoy = actionButton("DECOY") { [weak self] in self?.insertDecoy() }
        decoy.accessibilityHint = "Inserts a harmless decoy phrase without sending it"
        decoy.widthAnchor.constraint(equalToConstant: 66).isActive = true

        let space = keyButton("space") { [weak self] in self?.textDocumentProxy.insertText(" ") }
        space.accessibilityLabel = "Space"

        let returnButton = actionButton("return") { [weak self] in self?.textDocumentProxy.insertText("\n") }
        returnButton.accessibilityLabel = "Return"
        returnButton.widthAnchor.constraint(equalToConstant: 58).isActive = true

        row.addArrangedSubview(globe)
        row.addArrangedSubview(mode)
        row.addArrangedSubview(decoy)
        row.addArrangedSubview(space)
        row.addArrangedSubview(returnButton)
        return row
    }

    private func equalRow() -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = 5
        row.distribution = .fillEqually
        return row
    }

    private func characterButton(_ value: String) -> UIButton {
        let button = keyButton(value) { [weak self] in self?.insertCharacter(value) }
        if value.rangeOfCharacter(from: .letters) != nil {
            letterButtons.append((button, value))
        }
        return button
    }

    private func deleteButton() -> UIButton {
        let button = actionButton("⌫") { [weak self] in self?.textDocumentProxy.deleteBackward() }
        button.accessibilityLabel = "Delete"
        return button
    }

    private func keyButton(_ title: String, action: @escaping () -> Void) -> UIButton {
        let button = UIButton(type: .system)
        styleButton(button, title: title, actionStyle: false)
        button.addAction(UIAction { _ in action() }, for: .touchUpInside)
        return button
    }

    private func actionButton(_ title: String, action: @escaping () -> Void) -> UIButton {
        let button = UIButton(type: .system)
        styleButton(button, title: title, actionStyle: true)
        button.addAction(UIAction { _ in action() }, for: .touchUpInside)
        return button
    }

    private func configureButton(_ button: UIButton, title: String, action: Selector, actionStyle: Bool) {
        styleButton(button, title: title, actionStyle: actionStyle)
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    private func styleButton(_ button: UIButton, title: String, actionStyle: Bool) {
        button.setTitle(title, for: .normal)
        button.setTitleColor(inkColor, for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: title.count == 1 ? 20 : 12, weight: .medium)
        button.backgroundColor = actionStyle ? actionKeyColor : keyColor
        button.layer.cornerRadius = 6
        button.layer.borderWidth = 0.5
        button.layer.borderColor = UIColor.white.withAlphaComponent(0.09).cgColor
    }

    private func insertCharacter(_ rawValue: String) {
        let value: String
        if currentLayout == .letters && isShifted {
            value = rawValue.uppercased()
            isShifted = false
            updateShiftTitles()
        } else {
            value = rawValue
        }
        textDocumentProxy.insertText(value)
    }

    private func updateShiftTitles() {
        letterButtons.forEach { item in
            item.button.setTitle(isShifted ? item.value.uppercased() : item.value, for: .normal)
        }
    }

    @objc private func mintOrReset() {
        if mintedCode != nil {
            mintedCode = nil
            statusLabel.text = "PIQABU · IDLE"
            mintButton.setTitle("MINT", for: .normal)
            guidanceLabel.text = "MINT inserts a link. Send it, then tap it to enter Piqabu."
            return
        }

        var generator = SystemRandomNumberGenerator()
        let code = String((0..<6).map { _ in roomAlphabet.randomElement(using: &generator)! })
        let link = "https://piqabu.live/j/\(code)"
        textDocumentProxy.insertText(link)
        mintedCode = code
        statusLabel.text = "MINTED · \(code)"
        mintButton.setTitle("RESET", for: .normal)
        guidanceLabel.text = "Send the link, then tap it yourself to enter Piqabu."
    }

    private func insertDecoy() {
        guard let phrase = decoyPhrases.randomElement() else { return }
        textDocumentProxy.insertText(phrase)
    }
}
