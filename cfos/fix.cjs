const fs = require('fs');

let content = fs.readFileSync('client/src/pages/Home.tsx', 'utf-8');

// The function is currently defined with `{` and `return (` but not closed properly.
// Wait, patch4 already replaced `=> (` with `=> { return (`.
// So there is one missing `}` right before `  return (` where the Home component renders.

const target = "      </>\n    );\n\n  return (";
if (content.indexOf(target) !== -1) {
    content = content.replace(target, "      </>\n    );\n}\n\n  return (");
    fs.writeFileSync('client/src/pages/Home.tsx', content, 'utf-8');
    console.log("Fixed missing brace!");
} else {
    // try with \r\n
    const target2 = "      </>\r\n    );\r\n\r\n  return (";
    if (content.indexOf(target2) !== -1) {
        content = content.replace(target2, "      </>\r\n    );\r\n}\r\n\r\n  return (");
        fs.writeFileSync('client/src/pages/Home.tsx', content, 'utf-8');
        console.log("Fixed missing brace (CRLF)!");
    } else {
        console.log("Could not find the target to add the closing brace.");
        // let's do a more robust regex replacement
        content = content.replace(/      <\/>\r?\n    \);\r?\n\r?\n  return \(/, "      </>\n    );\n}\n\n  return (");
        fs.writeFileSync('client/src/pages/Home.tsx', content, 'utf-8');
        console.log("Fixed missing brace (Regex)!");
    }
}
